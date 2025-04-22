import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { Audio } from 'expo-av';
import { FontAwesome } from '@expo/vector-icons';
import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
  RTCView,
} from 'react-native-webrtc';

// API endpoint for getting ephemeral tokens - should be your server endpoint
const TOKEN_ENDPOINT = 'http://192.168.0.136:3030/api/get-realtime-token';
// Replace with your actual local IP address

export default function VoiceTestScreen() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [response, setResponse] = useState('');
  
  // WebRTC state
  const [dataChannel, setDataChannel] = useState<any>(null);
  const peerConnection = useRef<null | RTCPeerConnection>(null);
  const [localMediaStream, setLocalMediaStream] = useState<null | MediaStream>(null);
  const remoteMediaStream = useRef<MediaStream>(new MediaStream());
  const isVoiceOnly = true;

  // Add effect for data channel handling
  useEffect(() => {
    if (dataChannel) {
      // Handle incoming messages
      dataChannel.addEventListener('message', async (e: any) => {
        try {
          const data = JSON.parse(e.data);
          handleRealtimeEvent(data);
        } catch (error: any) {
          console.error('Error parsing message data:', error);
          addLog(`Message parsing error: ${error.message}`);
        }
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener('open', () => {
        setIsSessionActive(true);
        addLog('Data channel opened - session active');
        sendSystemMessage();
      });
    }
  }, [dataChannel]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prevLogs => [`[${timestamp}] ${message}`, ...prevLogs.slice(0, 19)]);
  };

  async function startSession() {
    try {
      setConnecting(true);
      addLog('Connecting to OpenAI Realtime API...');
      
      // Get ephemeral token from your express server
      addLog('Requesting ephemeral token...');
      const tokenResponse = await fetch(TOKEN_ENDPOINT);
      if (!tokenResponse.ok) {
        throw new Error(`Failed to get ephemeral token: ${tokenResponse.status}`);
      }
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.client_secret.value;
      addLog('Received ephemeral token');

      // Enable audio
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

      // Create a peer connection
      const pc = new RTCPeerConnection();
      
      // Set up event listeners
      pc.addEventListener('connectionstatechange', (e) => {
        addLog(`Connection state changed: ${pc.connectionState}`);
      });
      
      pc.addEventListener('track', (event) => {
        if (event.track) {
          addLog('Received remote track');
          remoteMediaStream.current.addTrack(event.track);
        }
      });

      // Add local audio track for microphone input
      const ms = await mediaDevices.getUserMedia({
        audio: true,
      });
      
      if (isVoiceOnly) {
        let videoTrack = ms.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false;
      }

      setLocalMediaStream(ms);
      pc.addTrack(ms.getTracks()[0]);
      addLog('Microphone access granted');

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel('oai-events');
      setDataChannel(dc);
      addLog('Data channel created');

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      addLog('Local description set');

      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';
      
      addLog('Sending SDP to OpenAI...');
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: pc.localDescription?.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(`SDP request failed: ${sdpResponse.status}`);
      }

      const answer = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      };
      
      await pc.setRemoteDescription(answer);
      addLog('Remote description set');

      peerConnection.current = pc;
      
      // DataChannel's 'open' event will set isSessionActive to true
      
    } catch (error: any) {
      console.error('Start session error:', error);
      addLog(`Session error: ${error.message}`);
      Alert.alert('Connection Error', error.message);
      setIsSessionActive(false);
    } finally {
      setConnecting(false);
    }
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    addLog('Stopping session');
    
    if (dataChannel) {
      dataChannel.close();
    }
    
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    if (localMediaStream) {
      localMediaStream.getTracks().forEach(track => track.stop());
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    setLocalMediaStream(null);
    addLog('Session stopped');
  }
  
  // Send system message to set up the assistant
  const sendSystemMessage = () => {
    if (!dataChannel) {
      addLog('Cannot send system message: data channel not ready');
      return;
    }
    
    const systemMessage = {
      type: 'message',
      role: 'system',
      content: `You are a helpful voice assistant. You provide clear, concise answers to questions.
      
      This is a test of OpenAI's Realtime API, so feel free to demonstrate your capabilities.
      
      Keep your responses relatively brief and conversational.`
    };
    
    try {
      dataChannel.send(JSON.stringify(systemMessage));
      addLog('Sent system message');
    } catch (error: any) {
      console.error('Error sending system message:', error);
      addLog(`System message error: ${error.message}`);
    }
  };
  
  // Start listening for user input
  const startListening = () => {
    if (!dataChannel || !isSessionActive) {
      addLog('Cannot start listening: not connected');
      return;
    }
    
    try {
      const audioMessage = {
        type: 'audio_input',
        encoding: 'audio/webm;codecs=opus'
      };
      
      dataChannel.send(JSON.stringify(audioMessage));
      addLog('Started listening');
    } catch (error: any) {
      console.error('Error starting listening:', error);
      addLog(`Listen error: ${error.message}`);
    }
  };
  
  // Stop listening for user input
  const stopListening = () => {
    if (!dataChannel || !isSessionActive) {
      addLog('Cannot stop listening: not connected');
      return;
    }
    
    try {
      const endAudioMessage = {
        type: 'audio_input_buffer_complete'
      };
      
      dataChannel.send(JSON.stringify(endAudioMessage));
      addLog('Stopped listening');
    } catch (error: any) {
      console.error('Error stopping listening:', error);
      addLog(`Stop listen error: ${error.message}`);
    }
  };
  
  // Handle events from Realtime API
  const handleRealtimeEvent = (event: any) => {
    console.log('Received event:', event);
    
    // Handle different event types based on your example
    if (event.type === 'response.audio_transcript.done') {
      setTranscript(event.transcript);
      addLog(`Transcript: ${event.transcript}`);
    } 
    else if (event.type === 'message' && event.role === 'assistant') {
      setResponse(event.content);
      addLog(`Assistant: ${event.content}`);
    }
    else if (event.type === 'speech') {
      if (event.status === 'started') {
        setIsSpeaking(true);
        addLog('Speech started');
      } else if (event.status === 'stopped') {
        setIsSpeaking(false);
        addLog('Speech stopped');
      }
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Voice Test' }} />
      <ScrollView style={styles.container}>
        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OpenAI Realtime API</Text>
          <View style={styles.buttonRow}>
            {!isSessionActive ? (
              <TouchableOpacity
                style={[styles.button, styles.apiButton]}
                onPress={startSession}
                disabled={connecting || isSessionActive}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Connect</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.disconnectButton]}
                onPress={stopSession}
                disabled={!isSessionActive}
              >
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>
              Status: {isSessionActive ? 'Connected to OpenAI Realtime API' : 'Disconnected'}
            </Text>
          </View>
        </View>
        
        {/* Voice Interaction */}
        {isSessionActive && (
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
              <Text style={styles.responseLabel}>Assistant says:</Text>
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
                  isSpeaking && styles.disabledMicroButton
                ]}
                onPressIn={startListening}
                onPressOut={stopListening}
                disabled={isSpeaking}
              >
                <FontAwesome 
                  name="microphone" 
                  size={36} 
                  color="#333" 
                />
                <Text style={styles.microButtonText}>
                  Press to Talk
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {/* Log Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          <View>
            {logs.map((log, index) => (
              <Text key={index}>{log}</Text>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
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
  disabledMicroButton: {
    backgroundColor: '#ccc',
  },
  microButtonText: {
    marginTop: 8,
    color: '#333',
    fontWeight: 'bold',
  }
});