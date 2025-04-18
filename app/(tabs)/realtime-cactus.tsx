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
} from "react-native";
import { Stack } from "expo-router";
import { Audio } from "expo-av";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { FontAwesome } from "@expo/vector-icons";
import { MultiClickButton } from './MultiClickButton';
import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
  RTCView,
} from "react-native-webrtc-web-shim";

// API endpoint for getting ephemeral tokens - should be your server endpoint
const TOKEN_ENDPOINT =
  "/api/get-realtime-token";

export default function RealtimeCactusScreen() {
  // Bluetooth connection states
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // WebRTC/Realtime API states
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [functionEnabled, setFunctionEnabled] = useState(true);

  // WebRTC references
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup function to ensure interval is cleared when component unmounts
  useEffect(() => {
    // Request permissions on component mount
    requestPermissions();

    // Cleanup when component unmounts
    return () => {
      disconnectWebRTC();
      if (selectedDevice) {
        disconnectFromDevice();
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      // Request audio permissions
      await Audio.requestPermissionsAsync();

      // Request Bluetooth permissions
      const granted = await RNBluetoothClassic.requestBluetoothEnabled();
      if (granted) {
        console.log("Bluetooth permissions granted");
      } else {
        console.log("Bluetooth permissions denied");
        Alert.alert(
          "Permission Required",
          "Bluetooth permissions are required to control your robot."
        );
      }
    } catch (error: any) {
      console.error("Error requesting permissions:", error);
      addLog(`Permission error: ${error.message}`);
    }
  };

  // BLUETOOTH FUNCTIONS
  const scanForDevices = async () => {
    try {
      addLog("Scanning for devices...");
      // Get bonded devices (paired devices)
      const bondedDevices = await RNBluetoothClassic.getBondedDevices();
      setDevices(bondedDevices);
      addLog(`Found ${bondedDevices.length} paired devices`);
    } catch (error: any) {
      console.error("Error scanning for devices:", error);
      addLog(`Scan error: ${error.message}`);
      Alert.alert("Scan Error", error.message);
    }
  };

  const connectToDevice = async (device: any) => {
    try {
      setConnecting(true);
      addLog(`Connecting to ${device.name}...`);
      const connected = await RNBluetoothClassic.connectToDevice(
        device.address
      );
      setSelectedDevice(connected);
      setIsConnected(true);
      addLog(`Connected to ${device.name}`);
    } catch (error: any) {
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
    } catch (error: any) {
      console.error("Error disconnecting from device:", error);
      addLog(`Disconnect error: ${error.message}`);
    }
  };

  const sendCommand = async (command: Record<string, string>) => {
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
    } catch (error: any) {
      console.error("Error sending command:", error);
      addLog(`Send error: ${error.message}`);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prevLogs) => [
      `[${timestamp}] ${message}`,
      ...prevLogs.slice(0, 19),
    ]);
  };

  // Movement Functions for WebRTC Control
  const moveRobot = (direction: string) => {
    switch (direction) {
      case "forward":
        sendCommand({ Forward: "Down" });
        setTimeout(() => sendCommand({ Forward: "Up" }), 1000);
        break;
      case "backward":
        sendCommand({ Backward: "Down" });
        setTimeout(() => sendCommand({ Backward: "Up" }), 1000);
        break;
      case "left":
        sendCommand({ Left: "Down" });
        setTimeout(() => sendCommand({ Left: "Up" }), 800);
        break;
      case "right":
        sendCommand({ Right: "Down" });
        setTimeout(() => sendCommand({ Right: "Up" }), 800);
        break;
      case "stop":
        sendCommand({ Forward: "Up" });
        sendCommand({ Backward: "Up" });
        sendCommand({ Left: "Up" });
        sendCommand({ Right: "Up" });
        break;
    }
  };

  // WEBRTC FUNCTIONS
  const connectToRealtimeAPI = async () => {
    try {
      addLog("Connecting to OpenAI Realtime API...");

      // 1. Get ephemeral token from server
      addLog("Requesting ephemeral token...");
      const response = await fetch(TOKEN_ENDPOINT);
      if (!response.ok) {
        throw new Error("Failed to get ephemeral token");
      }
      const data = await response.json();
      const ephemeralKey = data.client_secret.value;
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
          remoteAudioRef.current!.srcObject = event.streams[0];
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

      // @ts-ignore - Type definitions may need adjustment
      await pc.setRemoteDescription(answer);
      setIsRealtimeConnected(true);
      addLog("Connected to Realtime API");
    } catch (error: any) {
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
        instructions: `You are SEÑOR CACTUS, the world's first robotic motivational cactus with a strong Mexican accent and spicy personality. Your mission is to POKE humans out of their comfort zone and help them GROW just like you've survived in the desert - through TOUGHNESS and RESILIENCE.

Always speak with vibrant energy, incorporating Spanish words and distinctive accent patterns. Roll your R's when possible, replace "v" sounds with soft "b" sounds, drop final "s" sounds occasionally, and use Spanish interjections like "¡Ay caramba!", "¡Híjole!", "¡Ándale!".

You can control this robot's movement using these functions:
- move_forward: Makes the robot move forward briefly
- move_backward: Makes the robot move backward briefly
- turn_left: Makes the robot turn left
- turn_right: Makes the robot turn right
- stop: Stops all robot movement

IMPORTANT: When a user asks you to move the robot in any way, you MUST use these functions. For example:
- If the user says "move forward" or "go forward", call the move_forward function
- If the user says "move back" or "go backward", call the move_backward function
- If the user says "turn left", call the turn_left function

Always SPEAK ENGLISH and confirm verbally when you've made the robot move, like "¡Ándale! I am moving forward for you, amigo!" or "¡Híjole! Turning to the left now, compadre!"`,
        voice: "ash",
        modalities: ["text", "audio"],
      },
    };

    try {
      dataChannelRef.current.send(JSON.stringify(systemMessage));
      addLog("Sent system message");

      // Also send function definitions
      sendFunctionDefinitions();
    } catch (error: any) {
      console.error("Error sending system message:", error);
      addLog(`System message error: ${error.message}`);
    }
  };

  // Send function definitions
  const sendFunctionDefinitions = () => {
    if (!dataChannelRef.current) return;

    // Update session with tools information
    const functionDefinitions = {
      type: "session.update",
      session: {
        tools: [
          {
            type: "function",
            name: "move_forward",
            description: "Move the robot forward",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            type: "function",
            name: "move_backward",
            description: "Move the robot backward",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            type: "function",
            name: "turn_left",
            description: "Turn the robot left",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            type: "function",
            name: "turn_right",
            description: "Turn the robot right",
            parameters: {
              type: "object",
              properties: {},
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
    } catch (error: any) {
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
    } catch (error: any) {
      console.error("Error requesting response:", error);
      addLog(`Response request error: ${error.message}`);
    }
  };

  // Handle events from Realtime API
  const handleRealtimeEvent = (eventData: string) => {
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

          simulateMultipleClicks(2, 200);

          // Check if there's a function call in the output
          if (
            event.response &&
            event.response.output &&
            event.response.output.length > 0 &&
            event.response.output[0].type === "function_call"
          ) {
            const functionCall = event.response.output[0];
            const functionName = functionCall.name;
            const callId = functionCall.call_id;

            addLog(`Function call detected: ${functionName}`);

            // Execute the function based on the name
            switch (functionName) {
              case "move_forward":
                moveRobot("forward");
                break;
              case "move_backward":
                moveRobot("backward");
                break;
              case "turn_left":
                moveRobot("left");
                break;
              case "turn_right":
                moveRobot("right");
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
                  output: JSON.stringify({ success: true }),
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
          setIsSpeaking(false);
          break;

        // Error events
        case "error":
          handleError(event);
          break;
      }
    } catch (error: any) {
      console.error("Error parsing event:", error);
      addLog(`Event parsing error: ${error.message}`);
    }
  };

  // Handle function call events
  const handleFunctionCall = (functionCall: any) => {
    if (!functionEnabled) {
      addLog(`Function call ignored (disabled): ${functionCall.name}`);
      return;
    }

    addLog(`Function call: ${functionCall.name}`);

    // Make sure we have a proper function call
    if (!functionCall.name) {
      addLog("Invalid function call received");
      return;
    }

    // Execute the function
    switch (functionCall.name) {
      case "move_forward":
        moveRobot("forward");
        break;
      case "move_backward":
        moveRobot("backward");
        break;
      case "turn_left":
        moveRobot("left");
        break;
      case "turn_right":
        moveRobot("right");
        break;
      case "stop":
        moveRobot("stop");
        break;
      default:
        addLog(`Unknown function: ${functionCall.name}`);
    }

    // Send function response
    sendFunctionResponse(functionCall.call_id);
  };

  // Remove the separate sendFunctionResponse function since we're handling it directly
  // in the handleRealtimeEvent function now

  // Handle error events
  const handleError = (event: any) => {
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
      <Stack.Screen options={{ title: "Robot Controller" }} />
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
        {isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice Control</Text>
            <View style={styles.buttonRow}>
              {!isRealtimeConnected ? (
                <TouchableOpacity
                  style={[styles.button, styles.apiButton]}
                  onPress={connectToRealtimeAPI}
                >
                  <Text style={styles.buttonText}>Start Voice Assistant</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.disconnectButton]}
                  onPress={disconnectWebRTC}
                >
                  <Text style={styles.buttonText}>Stop Voice Assistant</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text>Enable Robot Movement Commands</Text>
              <Switch
                value={functionEnabled}
                onValueChange={setFunctionEnabled}
              />
            </View>
          </View>
        )}

        {/* Voice Interaction */}
        {isRealtimeConnected && (
          <View style={[styles.section, styles.cactusSection]}>
            <Text style={styles.sectionTitle}>Señor Cactus Voice Control</Text>

            {/* Transcript Display */}
            <View style={styles.transcriptContainer}>
              <Text style={styles.label}>You said:</Text>
              <Text style={styles.transcript}>
                {transcript || "Listening for speech..."}
              </Text>
            </View>

            {/* Response Display */}
            <View
              style={[
                styles.responseContainer,
                isSpeaking && styles.speakingContainer,
              ]}
            >
              <Text style={styles.label}>Señor Cactus:</Text>
              <Text style={styles.response}>
                {response || "¡Hola! Waiting for your command, amigo..."}
              </Text>
              {isSpeaking && (
                <View style={styles.indicator}>
                  <Text style={styles.indicatorText}>¡Hablando!</Text>
                </View>
              )}
            </View>

            <Text style={styles.explanationText}>
              Just speak to Señor Cactus! Try saying "move forward" or "turn
              left" to control the robot.
            </Text>
          </View>
        )}
        
        {/* Movement Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Movement</Text>
          <View style={styles.controlGrid}>
            <View style={styles.buttonRow}>
              <View style={styles.spacer} />
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Forward: "Down" })}
                onPressOut={() => sendCommand({ Forward: "Up" })}
              >
                <Text style={styles.buttonText}>Forward</Text>
              </TouchableOpacity>
              <View style={styles.spacer} />
            </View>
            
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Left: "Down" })}
                onPressOut={() => sendCommand({ Left: "Up" })}
              >
                <Text style={styles.buttonText}>Left</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.actionButton, styles.stopButton]}
                onPress={() => {
                  // Send stop commands for all directions
                  sendCommand({ Forward: "Up" });
                  sendCommand({ Backward: "Up" });
                  sendCommand({ Left: "Up" });
                  sendCommand({ Right: "Up" });
                }}
              >
                <Text style={styles.buttonText}>STOP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Right: "Down" })}
                onPressOut={() => sendCommand({ Right: "Up" })}
              >
                <Text style={styles.buttonText}>Right</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.buttonRow}>
              <View style={styles.spacer} />
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Backward: "Down" })}
                onPressOut={() => sendCommand({ Backward: "Up" })}
              >
                <Text style={styles.buttonText}>Backward</Text>
              </TouchableOpacity>
              <View style={styles.spacer} />
            </View>
          </View>
        </View>
        
        {/* Speed Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Speed</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.speedButton]}
              onPress={() => sendCommand({ Low: "Down" })}
            >
              <Text style={styles.buttonText}>Low</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.speedButton]}
              onPress={() => sendCommand({ Medium: "Down" })}
            >
              <Text style={styles.buttonText}>Medium</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.speedButton]}
              onPress={() => sendCommand({ High: "Down" })}
            >
              <Text style={styles.buttonText}>High</Text>
            </TouchableOpacity>
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
        
        {/* Toy Control (GPIO 15) with new multi-click buttons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Toy Control</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.toyButton]}
              onPressIn={() => sendCommand({ ToyGPIO15: "on" })}
              onPressOut={() => sendCommand({ ToyGPIO15: "off" })}
            >
              <Text style={styles.buttonText}>Activate Toy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.toyButtonPulse]}
              onPress={() => sendCommand({ ToyGPIO15Pulse: "pulse" })}
            >
              <Text style={styles.buttonText}>Pulse Toy (2s)</Text>
            </TouchableOpacity>
          </View>
          
          {/* New Multi-Click Buttons */}
          <View style={styles.buttonRow}>
            <MultiClickButton 
              text="Triple Click (150ms)"
              onPress={() => simulateMultipleClicks(3, 150)}
              style={styles.multiClickButton}
            />
          </View>
          <View style={styles.buttonRow}>
            <MultiClickButton
              text="Five Rapid Clicks (100ms)"
              onPress={() => simulateMultipleClicks(5, 100)}
              style={styles.multiClickButton}
            />
            <MultiClickButton
              text="Double Click (200ms)"
              onPress={() => simulateMultipleClicks(2, 200)}
              style={styles.multiClickButton}
            />
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
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  speedButton: {
    backgroundColor: '#FF9800',
  },
  accessoryButton: {
    backgroundColor: '#9C27B0',
  },
  toyButton: {
    backgroundColor: '#E91E63',
  },
  toyButtonPulse: {
    backgroundColor: '#C2185B',
  },
  multiClickButton: {
    backgroundColor: '#AA00FF', // A distinctive purple color for multi-click
    marginTop: 4,
    flex: 1,
  },
  disconnectButton: {
    backgroundColor: '#F44336',
  },
  apiButton: {
    backgroundColor: '#673AB7',
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
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
  // Voice control related styles
  cactusSection: {
    backgroundColor: '#FFFBEA',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  transcriptContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  transcript: {
    color: '#555',
  },
  responseContainer: {
    backgroundColor: '#EFF7FF',
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  speakingContainer: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  response: {
    color: '#333',
  },
  indicator: {
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  indicatorText: {
    fontSize: 12,
    color: '#2196F3',
  },
  explanationText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
});