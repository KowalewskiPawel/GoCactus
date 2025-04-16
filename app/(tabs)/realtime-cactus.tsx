import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  ActivityIndicator,
  Platform,
  Switch
} from 'react-native';
import { Stack } from 'expo-router';
import { Audio } from 'expo-av';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { FontAwesome } from '@expo/vector-icons';

// API endpoint for getting ephemeral tokens - should be your server endpoint
const TOKEN_ENDPOINT = 'http://192.168.0.136:3030/api/get-realtime-token';

export default function RealtimeCactusScreen() {
  // Bluetooth connection states
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  
  // OpenAI Realtime API connection states
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  
  // WebRTC references
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Audio stream state for React Native
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  
  // Function calling state (for controlling robot)
  const [functionEnabled, setFunctionEnabled] = useState(true);

  useEffect(() => {
    // Request permissions on component mount
    setupPermissions();
    
    // Cleanup when component unmounts
    return () => {
      disconnectWebRTC();
      if (selectedDevice) {
        disconnectFromDevice();
      }
      if (audioSound) {
        audioSound.unloadAsync();
      }
    };
  }, []);

  const setupPermissions = async () => {
    try {
      // Request audio recording permissions
      const audioPermission = await Audio.requestPermissionsAsync();
      
      // Request Bluetooth permissions
      const btGranted = await RNBluetoothClassic.requestBluetoothEnabled();
      
      if (!audioPermission.granted) {
        console.log('Audio recording permissions denied');
        Alert.alert('Permission Required', 'Audio recording permissions are required for voice interactions.');
      }
      
      if (!btGranted) {
        console.log('Bluetooth permissions denied');
        Alert.alert('Permission Required', 'Bluetooth permissions are required to control your cactus.');
      }
    } catch (error: any) {
      console.error('Error requesting permissions:', error);
      addLog(`Permission error: ${error.message}`);
    }
  };

  const scanForDevices = async () => {
    try {
      addLog('Scanning for devices...');
      // Get bonded devices (paired devices)
      const bondedDevices = await RNBluetoothClassic.getBondedDevices();
      setDevices(bondedDevices);
      addLog(`Found ${bondedDevices.length} paired devices`);
    } catch (error: any) {
      console.error('Error scanning for devices:', error);
      addLog(`Scan error: ${error.message}`);
      Alert.alert('Scan Error', error.message);
    }
  };

  const connectToDevice = async (device: any) => {
    try {
      setConnecting(true);
      addLog(`Connecting to ${device.name}...`);
      const connected = await RNBluetoothClassic.connectToDevice(device.address);
      setSelectedDevice(connected);
      setIsConnected(true);
      addLog(`Connected to ${device.name}`);
    } catch (error: any) {
      console.error('Error connecting to device:', error);
      addLog(`Connection error: ${error.message}`);
      Alert.alert('Connection Error', error.message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectFromDevice = async () => {
    try {
      if (selectedDevice) {
        addLog(`Disconnecting from ${selectedDevice.name}...`);
        await RNBluetoothClassic.disconnectFromDevice(selectedDevice.address);
        setSelectedDevice(null);
        setIsConnected(false);
        addLog('Disconnected');
      }
    } catch (error: any) {
      console.error('Error disconnecting from device:', error);
      addLog(`Disconnect error: ${error.message}`);
    }
  };

  const sendCommand = async (command: Record<string, string>) => {
    if (!isConnected || !selectedDevice) {
      addLog('Not connected - cannot send command');
      return;
    }

    try {
      const jsonCommand = JSON.stringify(command);
      addLog(`Sending: ${jsonCommand}`);
      await RNBluetoothClassic.writeToDevice(selectedDevice.address, jsonCommand);
    } catch (error: any) {
      console.error('Error sending command:', error);
      addLog(`Send error: ${error.message}`);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prevLogs => [`[${timestamp}] ${message}`, ...prevLogs.slice(0, 19)]);
  };

  // Function to activate cactus
  const activateCactus = () => {
    sendCommand({ ToyGPIO15: "on" });
  };

  // Function to deactivate cactus
  const deactivateCactus = () => {
    sendCommand({ ToyGPIO15: "off" });
  };

  // Function for the robot to move based on commands
  const moveRobot = (direction: string) => {
    switch(direction) {
      case 'forward':
        sendCommand({ Forward: "Down" });
        setTimeout(() => sendCommand({ Forward: "Up" }), 1000);
        break;
      case 'backward':
        sendCommand({ Backward: "Down" });
        setTimeout(() => sendCommand({ Backward: "Up" }), 1000);
        break;
      case 'left':
        sendCommand({ Left: "Down" });
        setTimeout(() => sendCommand({ Left: "Up" }), 800);
        break;
      case 'right':
        sendCommand({ Right: "Down" });
        setTimeout(() => sendCommand({ Right: "Up" }), 800);
        break;
      case 'stop':
        sendCommand({ Forward: "Up" });
        sendCommand({ Backward: "Up" });
        sendCommand({ Left: "Up" });
        sendCommand({ Right: "Up" });
        break;
    }
  };

  // WebRTC connection to OpenAI Realtime API
  const connectToRealtimeAPI = async () => {
    try {
      addLog('Connecting to OpenAI Realtime API...');
      
      // 1. Get ephemeral token from server
      addLog('Requesting ephemeral token...');
      const response = await fetch(TOKEN_ENDPOINT);
      if (!response.ok) {
        throw new Error('Failed to get ephemeral token');
      }
      const data = await response.json();
      const ephemeralKey = data.client_secret.value;
      addLog('Received ephemeral token');
      
      // 2. Initialize WebRTC peer connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      
      // 3. Set up audio element to play remote audio
      if (typeof document !== 'undefined') {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        remoteAudioRef.current = audioEl;
        
        // Handler for remote audio tracks
        pc.ontrack = (event) => {
          remoteAudioRef.current!.srcObject = event.streams[0];
          addLog('Received remote audio track');
        };
      } else {
        // React Native specific audio handling
        pc.ontrack = async (event) => {
          // This is a simplified example - actual implementation would need
          // to adapt the MediaStream from WebRTC to React Native Audio
          addLog('Received remote audio track - preparing for playback');
          // In a real implementation, you would need to convert the WebRTC
          // MediaStream to a format that expo-av can play
        };
      }
      
      // 4. Get local audio track
      if (navigator && navigator.mediaDevices) {
        // Web browser environment
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        audioStreamRef.current = mediaStream;
        mediaStream.getTracks().forEach(track => {
          pc.addTrack(track, mediaStream);
        });
      } else {
        // React Native environment - this would need a more specialized approach
        // using expo-av to get microphone input and then add it to the peer connection
        addLog('Setting up React Native audio input');
        // This is placeholder logic - actual implementation would be more complex
        await setupReactNativeAudio(pc);
      }
      
      // 5. Set up data channel for sending/receiving events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;
      
      dc.onopen = () => {
        addLog('Data channel opened');
        
        // Send system message to set up the assistant
        sendSystemMessage();
      };
      
      dc.onmessage = (event) => {
        handleRealtimeEvent(event.data);
      };
      
      // 6. Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp'
        },
      });
      
      if (!sdpResponse.ok) {
        throw new Error(`SDP request failed: ${sdpResponse.status}`);
      }
      
      const sdpData = await sdpResponse.text();
      const answer = {
        type: 'answer',
        sdp: sdpData,
      };
      

      // @ts-ignore
      await pc.setRemoteDescription(answer);
      setIsRealtimeConnected(true);
      addLog('Connected to Realtime API');
      
    } catch (error: any) {
      console.error('Error connecting to Realtime API:', error);
      addLog(`Realtime API connection error: ${error.message}`);
      Alert.alert('Connection Error', error.message);
    }
  };
  
  // Helper function for React Native audio setup
  const setupReactNativeAudio = async (pc: RTCPeerConnection) => {
    // This is a simplified placeholder - actual implementation would be more complex
    // and would involve converting between React Native's Audio system and WebRTC
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // This part would need to be customized based on a library that bridges
      // React Native audio with WebRTC
    } catch (error: any) {
      console.error('Error setting up React Native audio:', error);
      addLog(`Audio setup error: ${error.message}`);
    }
  };
  
  // Disconnect WebRTC
  const disconnectWebRTC = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    dataChannelRef.current = null;
    peerConnectionRef.current = null;
    audioStreamRef.current = null;
    
    setIsRealtimeConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    addLog('Disconnected from Realtime API');
  };
  
  // Send system message to set up the assistant
  const sendSystemMessage = () => {
    if (!dataChannelRef.current) return;
    
    const systemMessage = {
      type: 'message',
      role: 'system',
      content: `You are a friendly dancing cactus assistant named Cactus Jack. You have a fun and quirky personality.
      
      When you respond, the user will see a dancing cactus toy moving in sync with your voice.
      
      Keep your responses fairly short and engaging. Use a casual, friendly tone.
      
      You can control a small robot with these functions:
      - move_forward(): Makes the robot move forward briefly
      - move_backward(): Makes the robot move backward briefly
      - turn_left(): Makes the robot turn left
      - turn_right(): Makes the robot turn right
      - stop(): Stops all robot movement
      
      Only use these functions when the user explicitly asks you to move the robot.`
    };
    
    try {
      dataChannelRef.current.send(JSON.stringify(systemMessage));
      addLog('Sent system message');
    } catch (error: any) {
      console.error('Error sending system message:', error);
      addLog(`System message error: ${error.message}`);
    }
  };
  
  // Send function definitions
  const sendFunctionDefinitions = () => {
    if (!dataChannelRef.current) return;
    
    const functionDefinitions = {
      type: 'function_declarations',
      functions: [
        {
          name: 'move_forward',
          description: 'Move the robot forward',
          parameters: {}
        },
        {
          name: 'move_backward',
          description: 'Move the robot backward',
          parameters: {}
        },
        {
          name: 'turn_left',
          description: 'Turn the robot left',
          parameters: {}
        },
        {
          name: 'turn_right',
          description: 'Turn the robot right',
          parameters: {}
        },
        {
          name: 'stop',
          description: 'Stop all robot movement',
          parameters: {}
        }
      ]
    };
    
    try {
      dataChannelRef.current.send(JSON.stringify(functionDefinitions));
      addLog('Sent function definitions');
    } catch (error: any) {
      console.error('Error sending function definitions:', error);
      addLog(`Function definition error: ${error.message}`);
    }
  };
  
  // Toggle listening state
  const toggleListening = () => {
    if (!isRealtimeConnected) {
      Alert.alert('Not Connected', 'Please connect to the Realtime API first');
      return;
    }
    
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };
  
  // Start listening for user input
  const startListening = () => {
    if (!dataChannelRef.current) return;
    
    try {
      const audioMessage = {
        type: 'audio_input',
        encoding: 'audio/webm;codecs=opus'
      };
      
      dataChannelRef.current.send(JSON.stringify(audioMessage));
      setIsListening(true);
      addLog('Started listening');
    } catch (error: any) {
      console.error('Error starting listening:', error);
      addLog(`Listen error: ${error.message}`);
    }
  };
  
  // Stop listening for user input
  const stopListening = () => {
    if (!dataChannelRef.current) return;
    
    try {
      const endAudioMessage = {
        type: 'audio_input_buffer_complete'
      };
      
      dataChannelRef.current.send(JSON.stringify(endAudioMessage));
      setIsListening(false);
      addLog('Stopped listening');
    } catch (error: any) {
      console.error('Error stopping listening:', error);
      addLog(`Stop listen error: ${error.message}`);
    }
  };
  
  // Handle events from Realtime API
  const handleRealtimeEvent = (eventData: string) => {
    try {
      const event = JSON.parse(eventData);
      
      switch (event.type) {
        case 'transcript':
          handleTranscript(event);
          break;
        case 'message':
          handleMessage(event);
          break;
        case 'speech':
          handleSpeech(event);
          break;
        case 'function_call':
          handleFunctionCall(event);
          break;
        case 'error':
          handleError(event);
          break;
        default:
          addLog(`Received unknown event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error('Error parsing event:', error);
      addLog(`Event parsing error: ${error.message}`);
    }
  };
  
  // Handle transcript events
  const handleTranscript = (event: any) => {
    setTranscript(event.text);
    addLog(`Transcript: ${event.text}`);
  };
  
  // Handle message events
  const handleMessage = (event: any) => {
    if (event.role === 'assistant') {
      setResponse(event.content);
      addLog(`Assistant: ${event.content}`);
    }
  };
  
  // Handle speech events
  const handleSpeech = (event: any) => {
    if (event.status === 'started') {
      setIsSpeaking(true);
      activateCactus();
      addLog('Speech started');
    } else if (event.status === 'stopped') {
      setIsSpeaking(false);
      deactivateCactus();
      addLog('Speech stopped');
    }
  };
  
  // Handle function call events
  const handleFunctionCall = (event: any) => {
    if (!functionEnabled) {
      addLog(`Function call ignored (disabled): ${event.function.name}`);
      return;
    }
    
    addLog(`Function call: ${event.function.name}`);
    
    // Execute the function
    switch (event.function.name) {
      case 'move_forward':
        moveRobot('forward');
        break;
      case 'move_backward':
        moveRobot('backward');
        break;
      case 'turn_left':
        moveRobot('left');
        break;
      case 'turn_right':
        moveRobot('right');
        break;
      case 'stop':
        moveRobot('stop');
        break;
      default:
        addLog(`Unknown function: ${event.function.name}`);
    }
    
    // Send function response
    sendFunctionResponse(event.id);
  };
  
  // Send function response
  const sendFunctionResponse = (id: string) => {
    if (!dataChannelRef.current) return;
    
    try {
      const responseMessage = {
        type: 'function_response',
        id: id,
        result: {}
      };
      
      dataChannelRef.current.send(JSON.stringify(responseMessage));
      addLog('Sent function response');
    } catch (error: any) {
      console.error('Error sending function response:', error);
      addLog(`Function response error: ${error.message}`);
    }
  };
  
  // Handle error events
  const handleError = (event: any) => {
    console.error('Error from Realtime API:', event);
    addLog(`API Error: ${event.message}`);
    Alert.alert('API Error', event.message);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Realtime Cactus' }} />
      <ScrollView style={styles.container}>
        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Connection</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.button}
              onPress={scanForDevices}
              disabled={connecting}
            >
              <Text style={styles.buttonText}>Scan</Text>
            </TouchableOpacity>
            
            {isConnected ? (
              <TouchableOpacity
                style={[styles.button, styles.disconnectButton]}
                onPress={disconnectFromDevice}
              >
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          
          {/* Device List */}
          {devices.length > 0 && !isConnected && (
            <View style={styles.deviceList}>
              <Text style={styles.sectionTitle}>Select a device:</Text>
              {devices.map((device) => (
                <TouchableOpacity
                  key={device.address}
                  style={styles.deviceItem}
                  onPress={() => connectToDevice(device)}
                  disabled={connecting}
                >
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceAddress}>{device.address}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Connection Status */}
          <View style={styles.statusContainer}>
            {connecting ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Text style={styles.statusText}>
                Status: {isConnected ? `Connected to ${selectedDevice?.name}` : 'Disconnected'}
              </Text>
            )}
          </View>
        </View>
        
        {/* OpenAI Realtime API Connection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OpenAI Realtime API</Text>
          <View style={styles.buttonRow}>
            {!isRealtimeConnected ? (
              <TouchableOpacity
                style={[styles.button, styles.apiButton]}
                onPress={connectToRealtimeAPI}
                disabled={!isConnected}
              >
                <Text style={styles.buttonText}>Connect to Realtime API</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.disconnectButton]}
                onPress={disconnectWebRTC}
              >
                <Text style={styles.buttonText}>Disconnect Realtime API</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.sectionHeader}>
            <Text style={styles.subsectionTitle}>Function Calling</Text>
            <View style={styles.toggleContainer}>
              <Text>Enable</Text>
              <Switch
                value={functionEnabled}
                onValueChange={setFunctionEnabled}
              />
            </View>
          </View>
          
          <Text style={styles.explanationText}>
            When enabled, the cactus can control the robot through voice commands.
          </Text>
        </View>
        
        {/* Voice Interaction */}
        {isRealtimeConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice Interaction</Text>
            
            {/* Transcript Display */}
            <View style={styles.transcriptContainer}>
              <Text style={styles.transcriptLabel}>You said:</Text>
              <Text style={styles.transcriptText}>
                {transcript || "Press and hold to speak..."}
              </Text>
            </View>
            
            {/* Response Display */}
            <View style={[styles.responseContainer, isSpeaking && styles.activeResponseContainer]}>
              <Text style={styles.responseLabel}>Cactus says:</Text>
              <Text style={styles.responseText}>
                {response || "I'm waiting for your message!"}
              </Text>
              {isSpeaking && (
                <View style={styles.speakingIndicator}>
                  <Text style={styles.speakingText}>Speaking...</Text>
                </View>
              )}
            </View>
            
            {/* Voice Controls */}
            <View style={styles.microButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.microButton,
                  isListening && styles.listeningButton
                ]}
                onPressIn={startListening}
                onPressOut={stopListening}
                disabled={!isRealtimeConnected}
              >
                <FontAwesome 
                  name="microphone" 
                  size={36} 
                  color={isListening ? "#fff" : "#333"} 
                />
                <Text style={[
                  styles.microButtonText,
                  isListening && styles.listeningButtonText
                ]}>
                  {isListening ? "Listening..." : "Press to Talk"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Log Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          <View style={styles.logContainer}>
            {logs.map((log, index) => (
              <Text key={index} style={styles.logText}>{log}</Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#444',
  },
  explanationText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    minWidth: 100,
    alignItems: 'center',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  apiButton: {
    backgroundColor: '#4A90E2',
    minWidth: 200,
  },
  disconnectButton: {
    backgroundColor: '#F44336',
  },
  deviceList: {
    marginTop: 16,
  },
  deviceItem: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  deviceName: {
    fontWeight: 'bold',
  },
  deviceAddress: {
    fontSize: 12,
    color: '#666',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    color: '#666',
  },
  transcriptContainer: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  transcriptLabel: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#444',
  },
  transcriptText: {
    color: '#333',
    fontSize: 16,
  },
  responseContainer: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  activeResponseContainer: {
    backgroundColor: '#FFECB3',
  },
  responseLabel: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#2E7D32',
  },
  responseText: {
    color: '#333',
    fontSize: 16,
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  speakingText: {
    color: '#E91E63',
    fontStyle: 'italic',
    marginLeft: 4,
  },
  microButtonContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  microButton: {
    backgroundColor: '#E0E0E0',
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  listeningButton: {
    backgroundColor: '#E91E63',
  },
  microButtonText: {
    marginTop: 8,
    color: '#333',
    fontWeight: 'bold',
  },
  listeningButtonText: {
    color: '#fff',
  },
  logContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    padding: 8,
    maxHeight: 150,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    marginBottom: 2,
  },
});
