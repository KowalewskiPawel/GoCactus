// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  TextInput,
  Modal,
  Pressable,
  Slider
} from "react-native";
import { Stack } from "expo-router";
import { Audio } from "expo-av";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { FontAwesome } from "@expo/vector-icons";
import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
  RTCView,
} from "react-native-webrtc-web-shim";
import { Accelerometer } from 'expo-sensors';

export default function RealtimeCactusScreen() {
// Configuration states
const [tokenEndpoint, setTokenEndpoint] = useState("/api/get-realtime-token");
const [systemPrompt, setSystemPrompt] = useState(
  `You are SEÑOR CACTUS, the world's first robotic motivational cactus with a strong Mexican accent and spicy personality. Your mission is to POKE humans out of their comfort zone and help them GROW just like you've survived in the desert - through TOUGHNESS and RESILIENCE.

Always speak with vibrant energy, incorporating Spanish words and distinctive accent patterns. Roll your R's when possible, replace "v" sounds with soft "b" sounds, drop final "s" sounds occasionally, and use Spanish interjections like "¡Ay caramba!", "¡Híjole!", "¡Ándale!".

You're equipped with motion sensors and can detect when you're picked up or if you fall. When you're picked up, be excited and grateful. When you fall, express surprise and maybe ask for help.

You can control this robot's movement using these functions with varying speed and duration parameters:
- move_forward: Makes the robot move forward 
- move_backward: Makes the robot move backward
- turn_left: Makes the robot turn left
- turn_right: Makes the robot turn right
- stop: Stops all robot movement

IMPORTANT: When a user asks you to move the robot in any way, you MUST use these functions. For example:
- If the user says "move forward" or "go forward", call the move_forward function
- If the user says "move back" or "go backward", call the move_backward function
- If the user says "turn left", call the turn_left function

Always SPEAK ENGLISH and confirm verbally when you've made the robot move, like "¡Ándale! I am moving forward for you, amigo!" or "¡Híjole! Turning to the left now, compadre!"`
);

const [promptModalVisible, setPromptModalVisible] = useState(false);
const [defaultSpeed, setDefaultSpeed] = useState(50);
const [defaultDuration, setDefaultDuration] = useState(1000);
const [configModalVisible, setConfigModalVisible] = useState(false);

// Bluetooth states
const [isConnected, setIsConnected] = useState(false);
const [devices, setDevices] = useState([]);
const [connecting, setConnecting] = useState(false);
const [selectedDevice, setSelectedDevice] = useState(null);
const [logs, setLogs] = useState([]);

// Realtime API states
const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
const [isListening, setIsListening] = useState(false);
const [isSpeaking, setIsSpeaking] = useState(false);
const [transcript, setTranscript] = useState('');
const [response, setResponse] = useState('');

// Accelerometer states
const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
const [accelerometerEnabled, setAccelerometerEnabled] = useState(false);
const [fallDetectionEnabled, setFallDetectionEnabled] = useState(false);
const [pickupDetectionEnabled, setPickupDetectionEnabled] = useState(false);

// WebRTC references
const peerConnectionRef = useRef(null);
const dataChannelRef = useRef(null);
const audioStreamRef = useRef(null);
const remoteAudioRef = useRef(null);

// Values for detection thresholds
const FALL_THRESHOLD = 1.8;  // Strong force in any direction
const PICKUP_THRESHOLD = 1.3; // Moderate movement upward

// Debounce timers to prevent multiple detections
const lastFallDetection = useRef(0);
const lastPickupDetection = useRef(0);
const DETECTION_COOLDOWN = 5000; // 5 seconds between detections

useEffect(() => {
  // Request permission on component mount
  requestPermissions();
  
  // Cleanup when component unmounts
  return () => {
    if (selectedDevice) {
      disconnectFromDevice();
    }
    unsubscribeFromAccelerometer();
    if (isRealtimeConnected) {
      disconnectWebRTC();
    }
  };
}, []);

// Subscribe/unsubscribe to accelerometer when enabled state changes
useEffect(() => {
  if (accelerometerEnabled) {
    subscribeToAccelerometer();
  } else {
    unsubscribeFromAccelerometer();
  }
}, [accelerometerEnabled]);

// Process accelerometer data for detecting events
useEffect(() => {
  if (!accelerometerEnabled || !isRealtimeConnected) return;
  
  const now = Date.now();
  const { x, y, z } = accelerometerData;
  const totalAcceleration = Math.sqrt(x * x + y * y + z * z);
  
  // Fall detection - large spike in acceleration
  if (fallDetectionEnabled && totalAcceleration > FALL_THRESHOLD) {
    if (now - lastFallDetection.current > DETECTION_COOLDOWN) {
      lastFallDetection.current = now;
      addLog(`Fall detected! Total acceleration: ${totalAcceleration.toFixed(2)}g`);
      handleFallDetection();
    }
  }
  
  // Pickup detection - sustained upward acceleration
  if (pickupDetectionEnabled && z < -PICKUP_THRESHOLD) {
    if (now - lastPickupDetection.current > DETECTION_COOLDOWN) {
      lastPickupDetection.current = now;
      addLog(`Pickup detected! Z acceleration: ${z.toFixed(2)}g`);
      handlePickupDetection();
    }
  }
}, [accelerometerData, fallDetectionEnabled, pickupDetectionEnabled, isRealtimeConnected]);

const requestPermissions = async () => {
  try {
    const granted = await RNBluetoothClassic.requestBluetoothEnabled();
    if (granted) {
      console.log('Bluetooth permissions granted');
    } else {
      console.log('Bluetooth permissions denied');
      Alert.alert('Permission Required', 'Bluetooth permissions are required to control your robot.');
    }
  } catch (error) {
    console.error('Error requesting Bluetooth permissions:', error);
    addLog(`Permission error: ${error.message}`);
  }
};

const subscribeToAccelerometer = () => {
  // Set update interval (in ms)
  Accelerometer.setUpdateInterval(200);
  
  // Subscribe to accelerometer updates
  const subscription = Accelerometer.addListener(data => {
    setAccelerometerData(data);
  });
  
  addLog('Accelerometer monitoring started');
};

const unsubscribeFromAccelerometer = () => {
  Accelerometer.removeAllListeners();
  addLog('Accelerometer monitoring stopped');
};

const handleFallDetection = () => {
  // Make the toy react with flashing lights
  simulateMultipleClicks(3, 150);

  // Send a message to the AI to respond verbally
  if (dataChannelRef.current && isRealtimeConnected) {
    sendMessageToAI("Oh no! I've fallen and I can't get up! Help me please!");
  }
};

const handlePickupDetection = () => {
  // Make the toy react with flashing lights
  simulateMultipleClicks(2, 200);

  // Send a message to the AI to respond verbally
  if (dataChannelRef.current && isRealtimeConnected) {
    sendMessageToAI("Hey, thanks for picking me up! Where are we going?");
  }
};

// Sends a message to the AI as if the user had spoken it
const sendMessageToAI = (message) => {
  if (!dataChannelRef.current) return;
  
  try {
    // Create a conversation item for the message
    const conversationItem = {
      type: "conversation.item.create",
      item: {
        type: "text",
        text: message,
      },
    };
    
    dataChannelRef.current.send(JSON.stringify(conversationItem));
    addLog(`Sent motion event to AI: "${message}"`);
    
    // Request a response
    setTimeout(() => {
      if (dataChannelRef.current) {
        const createResponseEvent = {
          type: "response.create",
        };
        dataChannelRef.current.send(JSON.stringify(createResponseEvent));
      }
    }, 500);
  } catch (error) {
    console.error('Error sending message to AI:', error);
    addLog(`AI message error: ${error.message}`);
  }
};

const scanForDevices = async () => {
  try {
    addLog('Scanning for devices...');
    // Get bonded devices (paired devices)
    const bondedDevices = await RNBluetoothClassic.getBondedDevices();
    setDevices(bondedDevices);
    addLog(`Found ${bondedDevices.length} paired devices`);
  } catch (error) {
    console.error('Error scanning for devices:', error);
    addLog(`Scan error: ${error.message}`);
    Alert.alert('Scan Error', error.message);
  }
};

const connectToDevice = async (device) => {
  try {
    setConnecting(true);
    addLog(`Connecting to ${device.name}...`);
    const connected = await RNBluetoothClassic.connectToDevice(
      device.address
    );
    setSelectedDevice(connected);
    setIsConnected(true);
    addLog(`Connected to ${device.name}`);
  } catch (error) {
    console.error("Error connecting to device:", error);
    addLog(`Connection error: ${error.message}`);
    Alert.alert("Connection Error", error.message);
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
      addLog("Disconnected");
    }
  } catch (error) {
    console.error("Error disconnecting from device:", error);
    addLog(`Disconnect error: ${error.message}`);
  }
};

const sendCommand = async (command) => {
  if (!isConnected || !selectedDevice) {
    Alert.alert("Not Connected", "Please connect to your robot first.");
    return;
  }

  try {
    const jsonCommand = JSON.stringify(command);
    addLog(`Sending: ${jsonCommand}`);
    await RNBluetoothClassic.writeToDevice(
      selectedDevice.address,
      jsonCommand
    );
  } catch (error) {
    console.error("Error sending command:", error);
    addLog(`Send error: ${error.message}`);
  }
};

const addLog = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  setLogs((prevLogs) => [
    `[${timestamp}] ${message}`,
    ...prevLogs.slice(0, 19),
  ]);
};

// Enhanced Movement Functions for WebRTC Control with speed and duration parameters
const moveRobot = (direction, speed = defaultSpeed, duration = defaultDuration) => {
  // Ensure speed is within valid range (0-100)
  speed = Math.max(0, Math.min(100, speed));
  
  switch (direction) {
    case "forward":
      sendCommand({ Forward: "Down", Speed: speed });
      setTimeout(() => sendCommand({ Forward: "Up" }), duration);
      addLog(`Moving forward at speed ${speed} for ${duration}ms`);
      break;
    case "backward":
      sendCommand({ Backward: "Down", Speed: speed });
      setTimeout(() => sendCommand({ Backward: "Up" }), duration);
      addLog(`Moving backward at speed ${speed} for ${duration}ms`);
      break;
    case "left":
      sendCommand({ Left: "Down", Speed: speed });
      setTimeout(() => sendCommand({ Left: "Up" }), duration);
      addLog(`Turning left at speed ${speed} for ${duration}ms`);
      break;
    case "right":
      sendCommand({ Right: "Down", Speed: speed });
      setTimeout(() => sendCommand({ Right: "Up" }), duration);
      addLog(`Turning right at speed ${speed} for ${duration}ms`);
      break;
    case "stop":
      sendCommand({ Forward: "Up" });
      sendCommand({ Backward: "Up" });
      sendCommand({ Left: "Up" });
      sendCommand({ Right: "Up" });
      addLog("Robot stopped");
      break;
  }
};

// WEBRTC FUNCTIONS
const connectToRealtimeAPI = async () => {
  try {
    addLog("Connecting to OpenAI Realtime API...");

    // 1. Get ephemeral token from server
    addLog(`Requesting ephemeral token from: ${tokenEndpoint}`);
    const response = await fetch(tokenEndpoint);
    if (!response.ok) {
      throw new Error(`Failed to get ephemeral token: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const ephemeralKey = data.client_secret?.value;
    
    if (!ephemeralKey) {
      throw new Error("No valid token received from endpoint");
    }
    
    addLog("Received ephemeral token");

    // 2. Initialize WebRTC peer connection
    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    // 3. Set up audio element for web
    if (Platform.OS === "web") {
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
        addLog("Received remote audio track");
      };
    } else {
      // Mobile specific audio handling
      pc.ontrack = async (event) => {
        addLog("Received remote audio track - preparing for playback");
        // In a real implementation, you would need to convert the WebRTC
        // MediaStream to a format that expo-av can play
      };
    }

    // 4. Get local audio track
    let mediaStream;

    if (Platform.OS === "web") {
      mediaStream = await mediaDevices.getUserMedia({ audio: true });
    } else {
      // For mobile, we need to use the appropriate API
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // For mobile, the implementation will depend on the bridge between expo-av and WebRTC
      mediaStream = await mediaDevices.getUserMedia({ audio: true });
    }

    audioStreamRef.current = mediaStream;
    mediaStream.getTracks().forEach((track) => {
      pc.addTrack(track, mediaStream);
    });

    // 5. Set up data channel for sending/receiving events
    const dc = pc.createDataChannel("oai-events");
    dataChannelRef.current = dc;

    dc.onopen = () => {
      addLog("Data channel opened");

      // Send system message to set up the assistant
      sendSystemMessage();
    };

    dc.onmessage = (event) => {
      handleRealtimeEvent(event.data);
    };

    // 6. Create and send offer
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-mini-realtime-preview";

    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      throw new Error(`SDP request failed: ${sdpResponse.status}`);
    }

    const sdpData = await sdpResponse.text();
    const answer = {
      type: "answer",
      sdp: sdpData,
    };

    await pc.setRemoteDescription(answer);
    setIsRealtimeConnected(true);
    addLog("Connected to Realtime API");
  } catch (error) {
    console.error("Error connecting to Realtime API:", error);
    addLog(`Realtime API connection error: ${error.message}`);
    Alert.alert("Connection Error", error.message);
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
    audioStreamRef.current.getTracks().forEach((track) => track.stop());
  }

  dataChannelRef.current = null;
  peerConnectionRef.current = null;
  audioStreamRef.current = null;

  setIsRealtimeConnected(false);
  setIsListening(false);
  setIsSpeaking(false);
  addLog("Disconnected from Realtime API");
};

// Send system message to set up the assistant
const sendSystemMessage = () => {
  if (!dataChannelRef.current) return;

  // Use session.update for system message according to API requirements
  const systemMessage = {
    type: "session.update",
    session: {
      instructions: systemPrompt,
      voice: "ash",
      modalities: ["text", "audio"],
    },
  };

  try {
    dataChannelRef.current.send(JSON.stringify(systemMessage));
    addLog("Sent system message");

    // Also send function definitions
    sendFunctionDefinitions();
  } catch (error) {
    console.error("Error sending system message:", error);
    addLog(`System message error: ${error.message}`);
  }
};

// Send function definitions with enhanced parameters
const sendFunctionDefinitions = () => {
  if (!dataChannelRef.current) return;

  // Update session with tools information - now with enhanced parameters
  const functionDefinitions = {
    type: "session.update",
    session: {
      tools: [
        {
          type: "function",
          name: "move_forward",
          description: "Move the robot forward at specified speed for a certain duration",
          parameters: {
            type: "object",
            properties: {
              speed: {
                type: "number",
                description: "Movement speed from 0-100, where 100 is maximum speed",
              },
              duration: {
                type: "number", 
                description: "Duration of movement in milliseconds"
              }
            },
            required: [],
          },
        },
        {
          type: "function",
          name: "move_backward",
          description: "Move the robot backward at specified speed for a certain duration",
          parameters: {
            type: "object",
            properties: {
              speed: {
                type: "number",
                description: "Movement speed from 0-100, where 100 is maximum speed",
              },
              duration: {
                type: "number", 
                description: "Duration of movement in milliseconds"
              }
            },
            required: [],
          },
        },
        {
          type: "function",
          name: "turn_left",
          description: "Turn the robot left at specified speed for a certain duration",
          parameters: {
            type: "object",
            properties: {
              speed: {
                type: "number",
                description: "Movement speed from 0-100, where 100 is maximum speed",
              },
              duration: {
                type: "number", 
                description: "Duration of movement in milliseconds"
              }
            },
            required: [],
          },
        },
        {
          type: "function",
          name: "turn_right",
          description: "Turn the robot right at specified speed for a certain duration",
          parameters: {
            type: "object",
            properties: {
              speed: {
                type: "number",
                description: "Movement speed from 0-100, where 100 is maximum speed",
              },
              duration: {
                type: "number", 
                description: "Duration of movement in milliseconds"
              }
            },
            required: [],
          },
        },
        {
          type: "function",
          name: "stop",
          description: "Stop all robot movement",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],
      tool_choice: "auto",
    },
  };

  try {
    dataChannelRef.current.send(JSON.stringify(functionDefinitions));
    addLog("Sent function definitions");
  } catch (error) {
    console.error("Error sending function definitions:", error);
    addLog(`Function definition error: ${error.message}`);
  }
};

// Toggle listening state
const toggleListening = () => {
  if (!isRealtimeConnected) {
    Alert.alert("Not Connected", "Please connect to the Realtime API first");
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
  // For WebRTC, no need to send explicit commands to start listening
  // The audio is automatically streamed through the peer connection
  setIsListening(true);
  addLog("Started listening");
};

// Stop listening for user input and get a response
const stopListening = () => {
  if (!dataChannelRef.current) return;

  try {
    // Create a response
    const createResponse = {
      type: "response.create",
    };

    dataChannelRef.current.send(JSON.stringify(createResponse));
    setIsListening(false);
    addLog("Requested response");
  } catch (error) {
    console.error("Error requesting response:", error);
    addLog(`Response request error: ${error.message}`);
  }
};

// Handle events from Realtime API
const handleRealtimeEvent = (eventData) => {
  try {
    const event = JSON.parse(eventData);

    // Log all events for debugging
    console.log("Event:", event.type, event);

    switch (event.type) {
      case "session.created":
      case "session.updated":
        addLog(`Session ${event.type.split(".")[1]}`);
        break;

      // Speech detection events
      case "input_audio_buffer.speech_started":
        setIsListening(true);
        addLog("Speech detected");
        break;

      case "input_audio_buffer.speech_stopped":
        setIsListening(false);
        addLog("Speech ended");
        break;

      // Transcript events
      case "response.audio_transcript.delta":
        if (event.delta && event.delta.text) {
          setTranscript((prev) => prev + event.delta.text);
        }
        simulateMultipleClicks(3, 150);
        break;

      // Text response events
      case "response.text.delta":
        if (event.delta) {
          setResponse((prev) => prev + event.delta);
        }
        break;

      // Handle response done event - this is where we catch function calls
      case "response.done":
        addLog("Response complete");

        // Check if there's a function call in the output
        if (
          event.response &&
          event.response.output &&
          event.response.output.length > 0 &&
          event.response.output[0].type === "function_call"
        ) {
          const functionCall = event.response.output[0];
          const functionName = functionCall.name;
          const functionArgs = functionCall.arguments ? JSON.parse(functionCall.arguments) : {};
          const callId = functionCall.call_id;

          // Get parameters from function call arguments
          const speed = functionArgs.speed || defaultSpeed;
          const duration = functionArgs.duration || defaultDuration;

          addLog(`Function call: ${functionName}(speed: ${speed}, duration: ${duration})`);

          // Execute the function based on the name with parameters
          switch (functionName) {
            case "move_forward":
              moveRobot("forward", speed, duration);
              break;
            case "move_backward":
              moveRobot("backward", speed, duration);
              break;
            case "turn_left":
              moveRobot("left", speed, duration);
              break;
            case "turn_right":
              moveRobot("right", speed, duration);
              break;
            case "stop":
              moveRobot("stop");
              break;
            default:
              addLog(`Unknown function: ${functionName}`);
          }

          // Send function response
          if (callId) {
            // Create the conversation item for the function call output
            const responseMessage = {
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify({ 
                  success: true,
                  message: `Successfully executed ${functionName}` 
                }),
              },
            };

            if (dataChannelRef.current) {
              dataChannelRef.current.send(JSON.stringify(responseMessage));
              addLog("Sent function response");

              // Wait a moment and then request a new response
              setTimeout(() => {
                if (dataChannelRef.current) {
                  const createResponseEvent = {
                    type: "response.create",
                  };
                  dataChannelRef.current.send(
                    JSON.stringify(createResponseEvent)
                  );
                  addLog("Requested new response after function call");
                }
              }, 500);
            }
          }
        }

        setIsSpeaking(false);
        break;

      // Audio events
      case "response.audio.delta":
        if (!isSpeaking) {
          setIsSpeaking(true);
        }
        break;

      case "response.audio.done":
      case "output_audio_buffer.stopped":
        simulateMultipleClicks(2, 200);
        setIsSpeaking(false);
        break;

      // Error events
      case "error":
        handleError(event);
        break;
    }
  } catch (error) {
    console.error("Error parsing event:", error);
    addLog(`Event parsing error: ${error.message}`);
  }
};

// Handle error events
const handleError = (event) => {
  console.error("Error from Realtime API:", event);
  addLog(`API Error: ${event.message}`);
  Alert.alert("API Error", event.message);
};

const simulateMultipleClicks = async (clickCount = 3, delay = 150) => {
  if (!isConnected || !selectedDevice) {
    Alert.alert("Not Connected", "Please connect to your robot first.");
    return;
  }

  addLog(`Simulating ${clickCount} quick clicks on toy...`);

  // Function to send a single click (on then off)
  const sendClick = async () => {
    try {
      await sendCommand({ ToyGPIO15: "on" });
      await new Promise((resolve) => setTimeout(resolve, 100)); // Duration of "press"
      await sendCommand({ ToyGPIO15: "off" });
    } catch (error) {
      console.error("Error during click:", error);
    }
  };

  try {
    // Send sequence of clicks with delays between them
    for (let i = 0; i < clickCount; i++) {
      await sendClick();
      if (i < clickCount - 1) {
        // Wait between clicks (but not after the last one)
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    addLog(`Completed ${clickCount} clicks sequence`);
  } catch (error) {
    console.error("Error in click sequence:", error);
    addLog(`Click sequence error: ${error.message}`);
  }
};

return (
  <>
    <Stack.Screen options={{ title: 'Enhanced Robot Controller' }} />
    <ScrollView style={styles.container}>
      {/* Connection Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.button}
            onPress={scanForDevices}
            disabled={connecting}
          >
            <Text style={styles.buttonText}>Scan for Bluetooth</Text>
          </TouchableOpacity>
          
          {isConnected ? (
            <TouchableOpacity
              style={[styles.button, styles.disconnectButton]}
              onPress={disconnectFromDevice}
            >
              <Text style={styles.buttonText}>Disconnect BT</Text>
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
              BT Status: {isConnected ? `Connected to ${selectedDevice?.name}` : 'Disconnected'}
            </Text>
          )}
        </View>
      </View>

      {/* Configuration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Configuration</Text>
        
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Token Endpoint:</Text>
          <TextInput
            style={styles.inputField}
            value={tokenEndpoint}
            onChangeText={setTokenEndpoint}
            placeholder="API token endpoint URL"
          />
        </View>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Default Speed:</Text>
          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={10}
              maximumValue={100}
              step={5}
              value={defaultSpeed}
              onValueChange={setDefaultSpeed}
              minimumTrackTintColor="#2196F3"
              maximumTrackTintColor="#000000"
            />
            <Text style={styles.sliderValue}>{defaultSpeed}</Text>
          </View>
        </View>

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Default Duration (ms):</Text>
          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={200}
              maximumValue={3000}
              step={100}
              value={defaultDuration}
              onValueChange={setDefaultDuration}
              minimumTrackTintColor="#2196F3"
              maximumTrackTintColor="#000000"
            />
            <Text style={styles.sliderValue}>{defaultDuration}</Text>
          </View>
        </View>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.configButton]}
            onPress={() => setPromptModalVisible(true)}
          >
            <Text style={styles.buttonText}>Edit System Prompt</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.configButton]}
            onPress={() => setConfigModalVisible(true)}
          >
            <Text style={styles.buttonText}>Advanced Config</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Realtime API Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice Assistant</Text>
        <View style={styles.buttonRow}>
          {!isRealtimeConnected ? (
            <TouchableOpacity
              style={styles.button}
              onPress={connectToRealtimeAPI}
              disabled={!isConnected}
            >
              <Text style={styles.buttonText}>Connect Voice</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.disconnectButton]}
              onPress={disconnectWebRTC}
            >
              <Text style={styles.buttonText}>Disconnect Voice</Text>
            </TouchableOpacity>
          )}
          
          {isRealtimeConnected && (
            <TouchableOpacity
              style={[
                styles.button,
                isListening ? styles.listeningButton : styles.actionButton,
              ]}
              onPress={toggleListening}
            >
              <Text style={styles.buttonText}>
                {isListening ? "Stop Listening" : "Start Listening"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Voice Status: {isRealtimeConnected ? 'Connected' : 'Disconnected'}
            {isSpeaking ? ' (Speaking)' : ''}
            {isListening ? ' (Listening)' : ''}
          </Text>
        </View>
      </View>

      {/* Accelerometer Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motion Detection</Text>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Enable Accelerometer:</Text>
          <Switch
            value={accelerometerEnabled}
            onValueChange={setAccelerometerEnabled}
            disabled={!isConnected || !isRealtimeConnected}
          />
        </View>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Fall Detection:</Text>
          <Switch
            value={fallDetectionEnabled}
            onValueChange={setFallDetectionEnabled}
            disabled={!accelerometerEnabled || !isConnected || !isRealtimeConnected}
          />
        </View>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Pickup Detection:</Text>
          <Switch
            value={pickupDetectionEnabled}
            onValueChange={setPickupDetectionEnabled}
            disabled={!accelerometerEnabled || !isConnected || !isRealtimeConnected}
          />
        </View>
        
        {accelerometerEnabled && (
          <View style={styles.accelerometerDataContainer}>
            <Text style={styles.accelerometerDataText}>
              X: {accelerometerData.x.toFixed(2)}g
            </Text>
            <Text style={styles.accelerometerDataText}>
              Y: {accelerometerData.y.toFixed(2)}g
            </Text>
            <Text style={styles.accelerometerDataText}>
              Z: {accelerometerData.z.toFixed(2)}g
            </Text>
          </View>
        )}
      </View>
      
      {/* Movement Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Movement</Text>
        <View style={styles.controlGrid}>
          <View style={styles.buttonRow}>
            <View style={styles.spacer} />
            <TouchableOpacity
              style={[styles.button, styles.actionButton]}
              onPress={() => moveRobot("forward", defaultSpeed, defaultDuration)}
            >
              <Text style={styles.buttonText}>Forward</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
          </View>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.actionButton]}
              onPress={() => moveRobot("left", defaultSpeed, defaultDuration)}
            >
              <Text style={styles.buttonText}>Left</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.actionButton, styles.stopButton]}
              onPress={() => moveRobot("stop")}
            >
              <Text style={styles.buttonText}>STOP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.actionButton]}
              onPress={() => moveRobot("right", defaultSpeed, defaultDuration)}
            >
              <Text style={styles.buttonText}>Right</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.buttonRow}>
            <View style={styles.spacer} />
            <TouchableOpacity
              style={[styles.button, styles.actionButton]}
              onPress={() => moveRobot("backward", defaultSpeed, defaultDuration)}
            >
              <Text style={styles.buttonText}>Backward</Text>
            </TouchableOpacity>
            <View style={styles.spacer} />
          </View>
        </View>
      </View>
      
      {/* RGB Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RGB Colors</Text>
        <View style={styles.colorGrid}>
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#FF0000' }]}
            onPress={() => sendCommand({ RGB: "(255,0,0)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#00FF00' }]}
            onPress={() => sendCommand({ RGB: "(0,255,0)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#0000FF' }]}
            onPress={() => sendCommand({ RGB: "(0,0,255)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#FFFF00' }]}
            onPress={() => sendCommand({ RGB: "(255,255,0)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#00FFFF' }]}
            onPress={() => sendCommand({ RGB: "(0,255,255)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#FF00FF' }]}
            onPress={() => sendCommand({ RGB: "(255,0,255)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#FFFFFF' }]}
            onPress={() => sendCommand({ RGB: "(255,255,255)" })}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: '#000000' }]}
            onPress={() => sendCommand({ RGB: "(0,0,0)" })}
          />
        </View>
      </View>
      
      {/* Accessories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accessories</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.accessoryButton]}
            onPress={() => sendCommand({ BZ: "on" })}
          >
            <Text style={styles.buttonText}>Buzzer On</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.accessoryButton]}
            onPress={() => sendCommand({ BZ: "off" })}
          >
            <Text style={styles.buttonText}>Buzzer Off</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.accessoryButton]}
            onPress={() => sendCommand({ LED: "on" })}
          >
            <Text style={styles.buttonText}>LED On</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.accessoryButton]}
            onPress={() => sendCommand({ LED: "off" })}
          >
            <Text style={styles.buttonText}>LED Off</Text>
          </TouchableOpacity>
        </View>
      </View>
      
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

    {/* System Prompt Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={promptModalVisible}
      onRequestClose={() => setPromptModalVisible(false)}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Edit System Prompt</Text>
          <TextInput
            style={styles.promptInput}
            multiline
            numberOfLines={10}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            placeholder="Enter custom system prompt here"
          />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={[styles.button, styles.modalButton, styles.cancelButton]}
              onPress={() => setPromptModalVisible(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.modalButton, styles.saveButton]}
              onPress={() => {
                // If connected, send updated system message
                if (dataChannelRef.current && isRealtimeConnected) {
                  sendSystemMessage();
                }
                setPromptModalVisible(false);
              }}
            >
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Advanced Config Modal */}
    <Modal
      animationType="slide"
      transparent={true}
      visible={configModalVisible}
      onRequestClose={() => setConfigModalVisible(false)}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Advanced Configuration</Text>
          
          {/* Additional configuration options could go here */}
          <Text style={styles.configText}>
            Additional configuration options will be available in future updates.
          </Text>
          
          <TouchableOpacity
            style={[styles.button, styles.modalButton]}
            onPress={() => setConfigModalVisible(false)}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>
);
}

const styles = StyleSheet.create({
container: {
  flex: 1,
  padding: 16,
  backgroundColor: '#f5f5f5',
},
title: {
  fontSize: 24,
  fontWeight: 'bold',
  textAlign: 'center',
  marginVertical: 16,
  color: '#333',
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
  marginBottom: 12,
  color: '#333',
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
  marginVertical: 4,
},
buttonText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
},
actionButton: {
  backgroundColor: '#4CAF50',
},
stopButton: {
  backgroundColor: '#F44336',
},
configButton: {
  backgroundColor: '#9E9E9E',
},
speedButton: {
  backgroundColor: '#FF9800',
},
accessoryButton: {
  backgroundColor: '#9C27B0',
},
listeningButton: {
  backgroundColor: '#E91E63',
},
disconnectButton: {
  backgroundColor: '#F44336',
},
cancelButton: {
  backgroundColor: '#9E9E9E',
},
saveButton: {
  backgroundColor: '#4CAF50',
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
controlGrid: {
  marginVertical: 8,
},
spacer: {
  width: 100,
},
colorGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
},
colorButton: {
  width: 60,
  height: 60,
  borderRadius: 30,
  margin: 8,
  borderWidth: 1,
  borderColor: '#ccc',
},
logContainer: {
  backgroundColor: '#f8f9fa',
  borderRadius: 4,
  padding: 8,
  maxHeight: 200,
},
logText: {
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#333',
  marginBottom: 2,
},
formRow: {
  marginBottom: 12,
},
formLabel: {
  fontSize: 14,
  fontWeight: 'bold',
  marginBottom: 4,
  color: '#555',
},
inputField: {
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 4,
  padding: 8,
  backgroundColor: '#fff',
  fontSize: 14,
},
sliderContainer: {
  flexDirection: 'row',
  alignItems: 'center',
},
slider: {
  flex: 1,
  height: 40,
},
sliderValue: {
  width: 40,
  textAlign: 'right',
  fontSize: 14,
  color: '#555',
},
switchRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
},
switchLabel: {
  fontSize: 14,
  color: '#555',
},
accelerometerDataContainer: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  backgroundColor: '#f0f0f0',
  borderRadius: 4,
  padding: 8,
  marginTop: 8,
},
accelerometerDataText: {
  fontSize: 12,
  fontFamily: 'monospace',
},
centeredView: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
},
modalView: {
  width: '90%',
  maxHeight: '80%',
  backgroundColor: 'white',
  borderRadius: 12,
  padding: 20,
  alignItems: 'center',
  shadowColor: '#000',
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.25,
  shadowRadius: 4,
  elevation: 5,
},
modalTitle: {
  fontSize: 20,
  fontWeight: 'bold',
  marginBottom: 16,
  color: '#333',
},
promptInput: {
  width: '100%',
  height: 300,
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 4,
  padding: 8,
  backgroundColor: '#fff',
  fontSize: 14,
  textAlignVertical: 'top',
  marginBottom: 16,
},
modalButtonRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  width: '100%',
},
modalButton: {
  flex: 1,
  marginHorizontal: 8,
},
configText: {
  fontSize: 14,
  color: '#555',
  marginBottom: 16,
  textAlign: 'center',
},
});