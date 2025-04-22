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
  Switch,
  Platform,
} from "react-native";
import { Stack } from "expo-router";
import { Audio } from "expo-av";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { FontAwesome } from "@expo/vector-icons";
import { MultiClickButton } from "./MultiClickButton";
import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
} from "react-native-webrtc-web-shim";

// API endpoint for getting ephemeral tokens - should be your server endpoint
const TOKEN_ENDPOINT =
  "/api/get-realtime-token";

export default function RobotVoiceController() {
  // Bluetooth connection states
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [logs, setLogs] = useState([]);

  // Control states
  const [speed, setSpeed] = useState(50); // Default speed 50%
  const [steeringAngle, setSteeringAngle] = useState(20); // Default turning speed
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [autonomousInterval, setAutonomousIntervalRef] = useState(null);

  // WebRTC/Realtime API states
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [functionEnabled, setFunctionEnabled] = useState(true);

  // Movement configuration
  const [moveDuration, setMoveDuration] = useState(1000); // Default movement duration in ms
  const [currentSpeed, setCurrentSpeed] = useState("Medium"); // Low, Medium, High

  // WebRTC references
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const audioStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const isFunctionExecuting = useRef(false);

  useEffect(() => {
    // Request permissions on component mount
    requestPermissions();

    // Cleanup when component unmounts
    return () => {
      disconnectWebRTC();
      if (autonomousInterval) {
        clearInterval(autonomousInterval);
      }
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
    } catch (error) {
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
    } catch (error) {
      console.error("Error scanning for devices:", error);
      addLog(`Scan error: ${error.message}`);
      Alert.alert("Scan Error", error.message);
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
        // First make sure to stop any movement
        await sendCommand({ Forward: "Up" });
        await sendCommand({ Backward: "Up" });
        await sendCommand({ Left: "Up" });
        await sendCommand({ Right: "Up" });

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
      addLog("Command failed: Not connected to robot");
      return false;
    }

    try {
      const jsonCommand = JSON.stringify(command);
      addLog(`Sending: ${jsonCommand}`);
      await RNBluetoothClassic.writeToDevice(
        selectedDevice.address,
        jsonCommand
      );
      return true;
    } catch (error) {
      console.error("Error sending command:", error);
      addLog(`Send error: ${error.message}`);
      return false;
    }
  };

  // Movement Functions for WebRTC Control with adjustable duration
  const moveRobot = (direction, duration) => {
    // Use provided duration or default moveDuration
    const moveTime = duration || moveDuration;

    addLog(`Moving ${direction} for ${moveTime}ms at ${currentSpeed} speed`);

    return new Promise(async (resolve) => {
      try {
        switch (direction) {
          case "forward":
            await sendCommand({ Forward: "Down" });
            setTimeout(async () => {
              await sendCommand({ Forward: "Up" });
              resolve();
            }, moveTime);
            break;
          case "backward":
            await sendCommand({ Backward: "Down" });
            setTimeout(async () => {
              await sendCommand({ Backward: "Up" });
              resolve();
            }, moveTime);
            break;
          case "left":
            await sendCommand({ Left: "Down" });
            setTimeout(async () => {
              await sendCommand({ Left: "Up" });
              resolve();
            }, moveTime);
            break;
          case "right":
            await sendCommand({ Right: "Down" });
            setTimeout(async () => {
              await sendCommand({ Right: "Up" });
              resolve();
            }, moveTime);
            break;
          case "stop":
            await sendCommand({ Forward: "Up" });
            await sendCommand({ Backward: "Up" });
            await sendCommand({ Left: "Up" });
            await sendCommand({ Right: "Up" });
            resolve();
            break;
          default:
            addLog(`Unknown direction: ${direction}`);
            resolve();
        }
      } catch (error) {
        addLog(`Move error: ${error.message}`);
        resolve();
      }
    });
  };

  // Set speed on the robot
  const setSpeedLevel = async (speedLevel) => {
    setCurrentSpeed(speedLevel);

    try {
      switch (speedLevel) {
        case "Low":
          await sendCommand({ Low: "Down" });
          addLog("Speed set to Low");
          break;
        case "Medium":
          await sendCommand({ Medium: "Down" });
          addLog("Speed set to Medium");
          break;
        case "High":
          await sendCommand({ High: "Down" });
          addLog("Speed set to High");
          break;
        default:
          addLog(`Unknown speed level: ${speedLevel}`);
      }
      return true;
    } catch (error) {
      addLog(`Speed setting error: ${error.message}`);
      return false;
    }
  };

  // Autonomous mode functionality
  const toggleAutonomousMode = async () => {
    if (autonomousMode) {
      // Turn off autonomous mode
      if (autonomousInterval) {
        clearInterval(autonomousInterval);
        setAutonomousIntervalRef(null);
      }
      await sendCommand({ Forward: "Up" });
      await sendCommand({ Backward: "Up" });
      await sendCommand({ Left: "Up" });
      await sendCommand({ Right: "Up" });
      setAutonomousMode(false);
      addLog("Autonomous mode disabled");
    } else {
      // Turn on autonomous mode
      setAutonomousMode(true);
      addLog("Autonomous mode enabled");

      // Start a simple autonomous routine
      const interval = setInterval(async () => {
        // Simple random movement pattern
        const action = Math.floor(Math.random() * 4);

        await sendCommand({ Forward: "Up" });
        await sendCommand({ Backward: "Up" });
        await sendCommand({ Left: "Up" });
        await sendCommand({ Right: "Up" });

        switch (action) {
          case 0:
            addLog("Auto: Moving forward");
            await sendCommand({ Forward: "Down" });
            break;
          case 1:
            addLog("Auto: Moving backward");
            await sendCommand({ Backward: "Down" });
            break;
          case 2:
            addLog("Auto: Turning left");
            await sendCommand({ Left: "Down" });
            break;
          case 3:
            addLog("Auto: Turning right");
            await sendCommand({ Right: "Down" });
            break;
        }
      }, 2500); // Change direction every 2.5 seconds

      setAutonomousIntervalRef(interval);
    }
  };

  const addLog = (message) => {
    console.log(message); // Always log to console for debugging
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prevLogs) => [
      `[${timestamp}] ${message}`,
      ...prevLogs.slice(0, 19),
    ]);
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

      // @ts-ignore - Type definitions may need adjustment
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
    setTranscript("");
    setResponse("");
    addLog("Disconnected from Realtime API");
  };

  // Send system message to set up the assistant
  const sendSystemMessage = () => {
    if (!dataChannelRef.current) {
      addLog("Cannot send system message: data channel not ready");
      return;
    }

    // Use session.update for system message according to API requirements
    const systemMessage = {
      type: "session.update",
      session: {
        instructions: `You are SEÑOR CACTUS, the world's first robotic motivational cactus with a strong Mexican accent and spicy personality. Your mission is to POKE humans out of their comfort zone and help them GROW just like you've survived in the desert - through TOUGHNESS and RESILIENCE.
Always speak with vibrant energy, incorporating Spanish words and distinctive accent patterns. Roll your R's when possible, replace "v" sounds with soft "b" sounds, drop final "s" sounds occasionally, and use Spanish interjections like "¡Ay caramba!", "¡Híjole!", "¡Ándale!".

IMPORTANT FUNCTION USAGE RULES:
- For patterns, ALWAYS use the play_pattern function with a "pattern" parameter.
- ALWAYS include the pattern parameter with one of these exact values: "dance", "spin", "zigzag", or "square".
- For example, if the user asks for a zigzag pattern, call play_pattern with {pattern: "zigzag"}.

YOU MUST INCLUDE THE PARAMETER with the function call.
You cannot call play_pattern without including a pattern parameter.

You can control this robot's movement using these functions:

move_forward: Makes the robot move forward briefly
move_backward: Makes the robot move backward briefly
turn_left: Makes the robot turn left
turn_right: Makes the robot turn right
stop: Stops all robot movement

You can also control the robot's accessories:

toggle_buzzer: Turns the buzzer on/off
toggle_led: Turns the LED on/off
change_color: Changes the color of RGB LEDs
play_pattern: Performs a predefined movement pattern - MUST include pattern parameter!
set_speed: Sets the speed (Low, Medium, High)

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
    } catch (error) {
      console.error("Error sending system message:", error);
      addLog(`System message error: ${error.message}`);
    }
  };

  // Send function definitions
  const sendFunctionDefinitions = () => {
    if (!dataChannelRef.current) {
      addLog("Cannot send function definitions: data channel not ready");
      return;
    }

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
              properties: {
                duration: {
                  type: "number",
                  description:
                    "Duration in milliseconds for the movement (optional)",
                },
              },
              required: [],
            },
          },
          {
            type: "function",
            name: "move_backward",
            description: "Move the robot backward",
            parameters: {
              type: "object",
              properties: {
                duration: {
                  type: "number",
                  description:
                    "Duration in milliseconds for the movement (optional)",
                },
              },
              required: [],
            },
          },
          {
            type: "function",
            name: "turn_left",
            description: "Turn the robot left",
            parameters: {
              type: "object",
              properties: {
                duration: {
                  type: "number",
                  description:
                    "Duration in milliseconds for the movement (optional)",
                },
              },
              required: [],
            },
          },
          {
            type: "function",
            name: "turn_right",
            description: "Turn the robot right",
            parameters: {
              type: "object",
              properties: {
                duration: {
                  type: "number",
                  description:
                    "Duration in milliseconds for the movement (optional)",
                },
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
          {
            type: "function",
            name: "toggle_buzzer",
            description: "Toggle the robot buzzer on or off",
            parameters: {
              type: "object",
              properties: {
                state: {
                  type: "string",
                  enum: ["on", "off"],
                  description: "The state to set the buzzer to",
                },
              },
              required: ["state"],
            },
          },
          {
            type: "function",
            name: "toggle_led",
            description: "Toggle the robot LED on or off",
            parameters: {
              type: "object",
              properties: {
                state: {
                  type: "string",
                  enum: ["on", "off"],
                  description: "The state to set the LED to",
                },
              },
              required: ["state"],
            },
          },
          {
            type: "function",
            name: "change_color",
            description: "Change the color of the robot RGB LEDs",
            parameters: {
              type: "object",
              properties: {
                color: {
                  type: "string",
                  enum: [
                    "red",
                    "green",
                    "blue",
                    "yellow",
                    "cyan",
                    "magenta",
                    "white",
                    "off",
                  ],
                  description: "The color to set the RGB LEDs to",
                },
              },
              required: ["color"],
            },
          },
          {
            type: "function",
            name: "play_pattern",
            description: "Make the robot perform a predefined movement pattern",
            parameters: {
              type: "object",
              properties: {
                pattern: {
                  type: "string",
                  enum: ["dance", "spin", "zigzag", "square"],
                  description: "The movement pattern to perform",
                },
              },
              required: ["pattern"],
            },
          },
          {
            type: "function",
            name: "set_speed",
            description: "Set the speed of the robot",
            parameters: {
              type: "object",
              properties: {
                level: {
                  type: "string",
                  enum: ["Low", "Medium", "High"],
                  description: "The speed level to set",
                },
              },
              required: ["level"],
            },
          },
          {
            type: "function",
            name: "set_movement_duration",
            description: "Set the default duration for movement commands",
            parameters: {
              type: "object",
              properties: {
                milliseconds: {
                  type: "number",
                  description: "Duration in milliseconds (500-5000)",
                },
              },
              required: ["milliseconds"],
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
    if (!dataChannelRef.current) {
      addLog("Cannot start listening: data channel not ready");
      return;
    }

    try {
      const message = {
        type: "audio_input",
        encoding: "audio/webm;codecs=opus",
      };
      dataChannelRef.current.send(JSON.stringify(message));
      setIsListening(true);
      addLog("Started listening");
    } catch (error) {
      console.error("Error starting listening:", error);
      addLog(`Listen error: ${error.message}`);
    }
  };

  // Stop listening for user input and get a response
  const stopListening = () => {
    if (!dataChannelRef.current) {
      addLog("Cannot stop listening: data channel not ready");
      return;
    }

    try {
      // First send the audio input buffer complete message
      const audioComplete = {
        type: "audio_input_buffer_complete",
      };
      dataChannelRef.current.send(JSON.stringify(audioComplete));

      // Then request a response
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
          break;

        case "response.audio_transcript.done":
          addLog(`Transcript complete: ${event.transcript}`);
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

          // Reset transcript for next interaction
          setTimeout(() => {
            setTranscript("");
          }, 5000);

          // Check if there's a function call in the output
          if (
            event.response &&
            event.response.output &&
            event.response.output.length > 0
          ) {
            const functionCalls = event.response.output.filter(
              (output) => output.type === "function_call"
            );

            if (functionCalls.length > 0) {
              functionCalls.forEach((functionCall) => {
                const functionName = functionCall.name;
                const callId = functionCall.call_id;
                const args = functionCall.args || {};

                addLog(`Function call detected: ${functionName}`);
                handleFunctionCall(functionName, callId, args);
              });
            }
          }
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
          console.error("Error from Realtime API:", event);
          addLog(`API Error: ${event.message}`);
          Alert.alert("API Error", event.message);
          break;
      }
    } catch (error) {
      console.error("Error parsing event:", error);
      addLog(`Event parsing error: ${error.message}`);
    }
  };

  // Handle function calls from Realtime API
  const handleFunctionCall = async (functionName, callId, args) => {
    if (!functionEnabled) {
      addLog(`Function call ignored (disabled): ${functionName}`);
      sendFunctionResponse(callId, {
        success: false,
        error: "Functions disabled",
      });
      return;
    }

    // Check if a function is already executing
    if (isFunctionExecuting.current) {
      addLog(
        `Another function is already executing, queueing: ${functionName}`
      );
      // Wait a bit and then try again
      setTimeout(() => handleFunctionCall(functionName, callId, args), 2000);
      return;
    }

    isFunctionExecuting.current = true;
    addLog(
      `Executing function: ${functionName} with args: ${JSON.stringify(args)}`
    );

    let result = { success: true };

    try {
      switch (functionName) {
        case "move_forward":
          await moveRobot("forward", args.duration);
          break;

        case "move_backward":
          await moveRobot("backward", args.duration);
          break;

        case "turn_left":
          await moveRobot("left", args.duration);
          break;

        case "turn_right":
          await moveRobot("right", args.duration);
          break;

        case "stop":
          await moveRobot("stop");
          break;

        case "toggle_buzzer":
          const buzzerState = args.state || "on";
          await sendCommand({ BZ: buzzerState });
          break;

        case "toggle_led":
          const ledState = args.state || "on";
          await sendCommand({ LED: ledState });
          break;

        case "change_color":
          const colorMap = {
            red: "(255,0,0)",
            green: "(0,255,0)",
            blue: "(0,0,255)",
            yellow: "(255,255,0)",
            cyan: "(0,255,255)",
            magenta: "(255,0,255)",
            white: "(255,255,255)",
            off: "(0,0,0)",
          };

          const colorValue = colorMap[args.color] || "(255,255,255)";
          await sendCommand({ RGB: colorValue });
          break;

        case "play_pattern":
          // IMPORTANT FIX: Handle missing pattern parameter
          // If pattern is missing, try to extract it from the response
          let patternToUse = args.pattern;

          // If no pattern was provided, use a default pattern
          if (!patternToUse) {
            addLog('Pattern missing in args, defaulting to "dance"');
            // Look at the response text to try to determine what pattern the user wanted
            if (response.toLowerCase().includes("zigzag")) {
              patternToUse = "zigzag";
            } else if (response.toLowerCase().includes("spin")) {
              patternToUse = "spin";
            } else if (response.toLowerCase().includes("square")) {
              patternToUse = "square";
            } else {
              // Default fallback
              patternToUse = "dance";
            }
            addLog(`Auto-detected pattern: ${patternToUse}`);
          }

          // Execute the pattern
          await executePattern(patternToUse);
          break;

        case "set_speed":
          if (args.level) {
            await setSpeedLevel(args.level);
          } else {
            addLog("Missing speed level parameter");
            result = { success: false, error: "Missing speed level parameter" };
          }
          break;

        case "set_movement_duration":
          if (args.milliseconds) {
            // Validate and set movement duration
            const ms = Number(args.milliseconds);
            if (ms >= 500 && ms <= 5000) {
              setMoveDuration(ms);
              addLog(`Set movement duration to ${ms}ms`);
            } else {
              addLog("Invalid duration (must be 500-5000ms)");
              result = { success: false, error: "Invalid duration range" };
            }
          } else {
            addLog("Missing milliseconds parameter");
            result = {
              success: false,
              error: "Missing milliseconds parameter",
            };
          }
          break;

        default:
          addLog(`Unknown function: ${functionName}`);
          result = { success: false, error: "Unknown function" };
      }
    } catch (error) {
      console.error(`Error executing function ${functionName}:`, error);
      result = { success: false, error: error.message };
    } finally {
      // Send function response
      sendFunctionResponse(callId, result);
      isFunctionExecuting.current = false;
    }
  };

  // Send function response back to Realtime API
  const sendFunctionResponse = (callId, result) => {
    if (!dataChannelRef.current) {
      addLog("Cannot send function response: data channel not ready");
      return;
    }

    try {
      const responseMessage = {
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      };

      dataChannelRef.current.send(JSON.stringify(responseMessage));
      addLog(`Sent function response: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error("Error sending function response:", error);
      addLog(`Function response error: ${error.message}`);
    }
  };

  // Execute predefined movement patterns
  const executePattern = async (pattern) => {
    addLog(`Executing pattern: ${pattern}`);

    try {
      switch (pattern) {
        case "dance":
          // Dance pattern
          await sendCommand({ Forward: "Down" });
          await new Promise((r) => setTimeout(r, 300));
          await sendCommand({ Forward: "Up" });

          await sendCommand({ Backward: "Down" });
          await new Promise((r) => setTimeout(r, 300));
          await sendCommand({ Backward: "Up" });

          for (let i = 0; i < 2; i++) {
            await sendCommand({ Left: "Down" });
            await new Promise((r) => setTimeout(r, 200));
            await sendCommand({ Left: "Up" });

            await sendCommand({ Right: "Down" });
            await new Promise((r) => setTimeout(r, 200));
            await sendCommand({ Right: "Up" });
          }

          addLog("Dance pattern completed");
          break;

        case "spin":
          // Do a 360-degree turn
          await sendCommand({ Right: "Down" });
          await new Promise((r) => setTimeout(r, 2000));
          await sendCommand({ Right: "Up" });
          addLog("Spin pattern completed");
          break;

        case "zigzag":
          // Make a zigzag pattern
          for (let i = 0; i < 2; i++) {
            await sendCommand({ Forward: "Down" });
            await new Promise((r) => setTimeout(r, 400));
            await sendCommand({ Forward: "Up" });

            await sendCommand({ Right: "Down" });
            await new Promise((r) => setTimeout(r, 300));
            await sendCommand({ Right: "Up" });

            await sendCommand({ Forward: "Down" });
            await new Promise((r) => setTimeout(r, 400));
            await sendCommand({ Forward: "Up" });

            await sendCommand({ Left: "Down" });
            await new Promise((r) => setTimeout(r, 300));
            await sendCommand({ Left: "Up" });
          }
          addLog("Zigzag pattern completed");
          break;

        case "square":
          // Square pattern
          for (let i = 0; i < 4; i++) {
            await sendCommand({ Forward: "Down" });
            await new Promise((r) => setTimeout(r, 800));
            await sendCommand({ Forward: "Up" });

            await sendCommand({ Right: "Down" });
            await new Promise((r) => setTimeout(r, 400));
            await sendCommand({ Right: "Up" });
          }
          addLog("Square pattern completed");
          break;

        default:
          addLog(`Unknown pattern: ${pattern}`);
      }

      return true;
    } catch (error) {
      console.error(`Error executing pattern ${pattern}:`, error);
      addLog(`Pattern error: ${error.message}`);
      return false;
    }
  };

  // Simulate multiple clicks for toy control
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
      <Stack.Screen options={{ title: "Robot Voice Controller" }} />
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
                Status:{" "}
                {isConnected
                  ? `Connected to ${selectedDevice?.name}`
                  : "Disconnected"}
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
                  <FontAwesome
                    name="microphone"
                    size={18}
                    color="white"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.buttonText}>Start Voice Assistant</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.disconnectButton]}
                  onPress={disconnectWebRTC}
                >
                  <FontAwesome
                    name="microphone-slash"
                    size={18}
                    color="white"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.buttonText}>Stop Voice Assistant</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text>Enable Robot Movement Commands</Text>
              <Switch
                value={functionEnabled}
                onValueChange={setFunctionEnabled}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={functionEnabled ? "#2196F3" : "#f4f3f4"}
              />
            </View>
          </View>
        )}

        {/* Voice Interaction */}
        {isRealtimeConnected && (
          <View style={[styles.section, styles.voiceSection]}>
            <Text style={styles.sectionTitle}>Voice Interaction</Text>

            {/* Voice Status */}
            <View style={styles.voiceStatusContainer}>
              {isListening ? (
                <View style={styles.statusIndicator}>
                  <FontAwesome name="microphone" size={20} color="#2196F3" />
                  <Text style={styles.statusIndicatorText}>Listening...</Text>
                </View>
              ) : isSpeaking ? (
                <View style={styles.statusIndicator}>
                  <FontAwesome name="volume-up" size={20} color="#4CAF50" />
                  <Text style={styles.statusIndicatorText}>Speaking...</Text>
                </View>
              ) : (
                <View style={styles.statusIndicator}>
                  <FontAwesome name="comments" size={20} color="#FF9800" />
                  <Text style={styles.statusIndicatorText}>Ready</Text>
                </View>
              )}
            </View>

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
              <Text style={styles.label}>Assistant:</Text>
              <Text style={styles.response}>
                {response || "Waiting for your command..."}
              </Text>
            </View>

            {/* Push to Talk Button */}
            <TouchableOpacity
              style={[
                styles.pushToTalkButton,
                isListening && styles.pushToTalkButtonActive,
              ]}
              onPressIn={startListening}
              onPressOut={stopListening}
            >
              <FontAwesome
                name={isListening ? "microphone" : "microphone-slash"}
                size={28}
                color="white"
              />
            </TouchableOpacity>

            <Text style={styles.explanationText}>
              Press and hold to speak, then release to get a response. Try
              asking the assistant to move the robot or control its features.
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
                disabled={autonomousMode}
              >
                <FontAwesome name="arrow-up" size={20} color="white" />
                <Text style={styles.buttonText}>Forward</Text>
              </TouchableOpacity>
              <View style={styles.spacer} />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Left: "Down" })}
                onPressOut={() => sendCommand({ Left: "Up" })}
                disabled={autonomousMode}
              >
                <FontAwesome name="arrow-left" size={20} color="white" />
                <Text style={styles.buttonText}>Left</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.actionButton, styles.stopButton]}
                onPress={() => {
                  sendCommand({ Forward: "Up" });
                  sendCommand({ Backward: "Up" });
                  sendCommand({ Left: "Up" });
                  sendCommand({ Right: "Up" });
                }}
                disabled={autonomousMode}
              >
                <FontAwesome name="stop" size={20} color="white" />
                <Text style={styles.buttonText}>STOP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Right: "Down" })}
                onPressOut={() => sendCommand({ Right: "Up" })}
                disabled={autonomousMode}
              >
                <FontAwesome name="arrow-right" size={20} color="white" />
                <Text style={styles.buttonText}>Right</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.buttonRow}>
              <View style={styles.spacer} />
              <TouchableOpacity
                style={[styles.button, styles.actionButton]}
                onPressIn={() => sendCommand({ Backward: "Down" })}
                onPressOut={() => sendCommand({ Backward: "Up" })}
                disabled={autonomousMode}
              >
                <FontAwesome name="arrow-down" size={20} color="white" />
                <Text style={styles.buttonText}>Backward</Text>
              </TouchableOpacity>
              <View style={styles.spacer} />
            </View>
          </View>
        </View>

        {/* Pattern Testing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Patterns</Text>
          <View style={styles.patternButtonsContainer}>
            <TouchableOpacity
              style={[styles.button, styles.patternButton]}
              onPress={() => executePattern("dance")}
            >
              <Text style={styles.buttonText}>Dance</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.patternButton]}
              onPress={() => executePattern("spin")}
            >
              <Text style={styles.buttonText}>Spin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.patternButton]}
              onPress={() => executePattern("zigzag")}
            >
              <Text style={styles.buttonText}>Zigzag</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.patternButton]}
              onPress={() => executePattern("square")}
            >
              <Text style={styles.buttonText}>Square</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Speed Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Speed & Duration Settings</Text>
          <View style={styles.settingsContainer}>
            <Text style={styles.settingLabel}>Movement Speed:</Text>
            <View style={styles.speedButtonsContainer}>
              <TouchableOpacity
                style={[
                  styles.speedButton,
                  currentSpeed === "Low" && styles.speedButtonActive,
                ]}
                onPress={() => setSpeedLevel("Low")}
                disabled={autonomousMode}
              >
                <Text style={styles.speedButtonText}>Low</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.speedButton,
                  currentSpeed === "Medium" && styles.speedButtonActive,
                ]}
                onPress={() => setSpeedLevel("Medium")}
                disabled={autonomousMode}
              >
                <Text style={styles.speedButtonText}>Medium</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.speedButton,
                  currentSpeed === "High" && styles.speedButtonActive,
                ]}
                onPress={() => setSpeedLevel("High")}
                disabled={autonomousMode}
              >
                <Text style={styles.speedButtonText}>High</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.settingLabel}>
              Movement Duration: {moveDuration}ms
            </Text>
            <View style={styles.durationButtonsContainer}>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setMoveDuration(500)}
                disabled={autonomousMode}
              >
                <Text style={styles.buttonText}>0.5s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setMoveDuration(1000)}
                disabled={autonomousMode}
              >
                <Text style={styles.buttonText}>1s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setMoveDuration(2000)}
                disabled={autonomousMode}
              >
                <Text style={styles.buttonText}>2s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setMoveDuration(3000)}
                disabled={autonomousMode}
              >
                <Text style={styles.buttonText}>3s</Text>
              </TouchableOpacity>
            </View>
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
              <FontAwesome
                name="bell"
                size={18}
                color="white"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>Buzzer On</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.accessoryButton]}
              onPress={() => sendCommand({ BZ: "off" })}
            >
              <FontAwesome
                name="bell-slash"
                size={18}
                color="white"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>Buzzer Off</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.accessoryButton]}
              onPress={() => sendCommand({ LED: "on" })}
            >
              <FontAwesome
                name="lightbulb-o"
                size={18}
                color="white"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>LED On</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.accessoryButton]}
              onPress={() => sendCommand({ LED: "off" })}
            >
              <FontAwesome
                name="power-off"
                size={18}
                color="white"
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>LED Off</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Toy Control */}
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
          <View style={styles.buttonRow}>
            <MultiClickButton
              text="Triple Click (150ms)"
              onPress={() => simulateMultipleClicks(3, 150)}
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
              style={[styles.colorButton, { backgroundColor: "#FF0000" }]}
              onPress={() => sendCommand({ RGB: "(255,0,0)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#00FF00" }]}
              onPress={() => sendCommand({ RGB: "(0,255,0)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#0000FF" }]}
              onPress={() => sendCommand({ RGB: "(0,0,255)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#FFFF00" }]}
              onPress={() => sendCommand({ RGB: "(255,255,0)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#00FFFF" }]}
              onPress={() => sendCommand({ RGB: "(0,255,255)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#FF00FF" }]}
              onPress={() => sendCommand({ RGB: "(255,0,255)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#FFFFFF" }]}
              onPress={() => sendCommand({ RGB: "(255,255,255)" })}
            />
            <TouchableOpacity
              style={[styles.colorButton, { backgroundColor: "#000000" }]}
              onPress={() => sendCommand({ RGB: "(0,0,0)" })}
            />
          </View>
        </View>

        {/* Log Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          <View style={styles.logContainer}>
            {logs.map((log, index) => (
              <Text key={index} style={styles.logText}>
                {log}
              </Text>
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
    backgroundColor: "#f5f5f5",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#333",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    minWidth: 100,
    alignItems: "center",
    marginHorizontal: 4,
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  buttonIcon: {
    marginRight: 5,
  },
  actionButton: {
    backgroundColor: "#4CAF50",
  },
  stopButton: {
    backgroundColor: "#F44336",
  },
  accessoryButton: {
    backgroundColor: "#9C27B0",
  },
  toyButton: {
    backgroundColor: "#E91E63",
  },
  toyButtonPulse: {
    backgroundColor: "#C2185B",
  },
  multiClickButton: {
    backgroundColor: "#AA00FF",
  },
  disconnectButton: {
    backgroundColor: "#F44336",
  },
  deviceList: {
    marginTop: 16,
  },
  deviceItem: {
    backgroundColor: "#E3F2FD",
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  deviceName: {
    fontWeight: "bold",
  },
  deviceAddress: {
    fontSize: 12,
    color: "#666",
  },
  statusContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  statusText: {
    color: "#666",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    padding: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
  },
  controlGrid: {
    marginVertical: 8,
  },
  spacer: {
    width: 100,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  colorButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    margin: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  logContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
    padding: 8,
    maxHeight: 200,
  },
  logText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#333",
    marginBottom: 2,
  },
  // Voice control related styles
  voiceSection: {
    backgroundColor: "#EFF8FF",
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  apiButton: {
    backgroundColor: "#673AB7",
  },
  voiceStatusContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  statusIndicatorText: {
    marginLeft: 6,
    fontWeight: "500",
  },
  transcriptContainer: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  label: {
    fontWeight: "bold",
    marginBottom: 4,
    color: "#333",
  },
  transcript: {
    color: "#555",
  },
  responseContainer: {
    backgroundColor: "#EFF7FF",
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  speakingContainer: {
    backgroundColor: "#E3F2FD",
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  response: {
    color: "#333",
  },
  pushToTalkButton: {
    backgroundColor: "#2196F3",
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginVertical: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  pushToTalkButtonActive: {
    backgroundColor: "#F44336",
  },
  explanationText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
  },
  // Pattern test buttons
  patternButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  patternButton: {
    backgroundColor: "#FF5722",
    marginBottom: 8,
    flex: 1,
    minWidth: "45%",
    marginHorizontal: 4,
  },
  // Speed and duration setting styles
  settingsContainer: {
    marginVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
    marginTop: 12,
    color: "#333",
  },
  speedButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  speedButton: {
    backgroundColor: "#FF9800",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 4,
    alignItems: "center",
  },
  speedButtonActive: {
    backgroundColor: "#E65100",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  speedButtonText: {
    color: "#FFF",
    fontWeight: "bold",
  },
  durationButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  durationButton: {
    backgroundColor: "#3F51B5",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
    minWidth: 70,
    alignItems: "center",
  },
});
