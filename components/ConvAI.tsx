'use dom';

import { useCallback, useEffect, useState } from 'react';
import { useConversation } from '@11labs/react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Mic } from 'lucide-react-native';
import robotTools from '../utils/robotTools';

async function requestMicrophonePermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (error) {
    console.log(error);
    console.error('Microphone permission denied');
    return false;
  }
}

export default function ConvAiDOMComponent({
  platform,
  isConnected,
  sendBluetoothCommand,
  onMessage,
  agentId,
  apiKey,
}: {
  dom?: import('expo/dom').DOMProps;
  platform: string;
  isConnected: boolean;
  sendBluetoothCommand: (command: Record<string, string>) => Promise<void>;
  onMessage: (message: any) => void;
  agentId: string;
  apiKey?: string;
}) {
  const [sessionActive, setSessionActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const conversation = useConversation({
    onConnect: () => {
      console.log('Connected to ElevenLabs');
      setSessionActive(true);
      setStatusMessage('Connected to ElevenLabs');
    },
    onDisconnect: () => {
      console.log('Disconnected from ElevenLabs');
      setSessionActive(false);
      setStatusMessage('Disconnected from ElevenLabs');
    },
    onMessage: (message) => {
      console.log('Message received:', message);
      onMessage(message);
    },
    onError: (error) => {
      console.error('Error:', error);
      setStatusMessage(`Error: ${error || 'Unknown error'}`);
    },
  });

  // Keep session alive
  useEffect(() => {
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
    
    if (sessionActive) {
      // Send a periodic keep-alive ping
      keepAliveInterval = setInterval(() => {
        // This empty function just ensures the WebView stays active
        console.log('Keeping session alive...');
      }, 10000);
    }
    
    return () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
    };
  }, [sessionActive]);

  const startConversation = useCallback(async () => {
    try {
      setStatusMessage('Requesting microphone permission...');
      
      // Request microphone permission
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setStatusMessage('Microphone permission denied');
        return;
      }

      setStatusMessage('Starting conversation...');
      // Start the conversation with your agent
      console.log('calling startSession with agent ID:', agentId);
      await conversation.startSession({
        agentId: agentId, // Using the agent ID from props
        ...(apiKey ? { apiKey } : {}), // Include API key if provided
        dynamicVariables: {
          platform,
          isConnected: isConnected ? 'connected' : 'disconnected',
        },
        clientTools: {
          move_forward: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.moveForward(sendBluetoothCommand);
          },
          move_backward: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.moveBackward(sendBluetoothCommand);
          },
          turn_left: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.turnLeft(sendBluetoothCommand);
          },
          turn_right: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.turnRight(sendBluetoothCommand);
          },
          stop_robot: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.stopRobot(sendBluetoothCommand);
          },
          set_color: async ({ color }: { color: string }) => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.setColor(sendBluetoothCommand, color);
          },
          set_speed: async ({ level }: { level: string }) => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.setSpeed(sendBluetoothCommand, level);
          },
          buzzer: async ({ state }: { state: string }) => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.setBuzzer(sendBluetoothCommand, state.toLowerCase() === 'on');
          },
          activate_toy: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.activateToy(sendBluetoothCommand);
          },
          pulse_toy: async () => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.pulseToy(sendBluetoothCommand);
          },
          check_connection: async () => {
            return isConnected ? 'Robot is connected' : 'Robot is not connected';
          },
          parse_voice_command: async ({ command }: { command: string }) => {
            if (!isConnected) return 'Not connected to robot';
            return robotTools.parseVoiceCommand(command, sendBluetoothCommand);
          }
        },
      });
    } catch (error: any) {
      console.error('Failed to start conversation:', error);
      setStatusMessage(`Failed to start: ${error.message || 'Unknown error'}`);
    }
  }, [conversation, isConnected, platform, sendBluetoothCommand]);

  const stopConversation = useCallback(async () => {
    setStatusMessage('Ending conversation...');
    try {
      await conversation.endSession();
    } catch (error: any) {
      console.error('Error ending conversation:', error);
      setStatusMessage(`Error ending: ${error.message || 'Unknown error'}`);
    }
  }, [conversation]);

  // Display status message for debugging
  useEffect(() => {
    if (statusMessage) {
      console.log(statusMessage);
      // Clear status message after 5 seconds
      const timer = setTimeout(() => {
        setStatusMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  return (
    <View style={styles.container}>
      <Pressable
        style={[
          styles.callButton,
          conversation.status === 'connected' && styles.callButtonActive,
          !isConnected && styles.callButtonDisabled,
        ]}
        disabled={!isConnected}
        onPress={
          conversation.status === 'disconnected'
            ? startConversation
            : stopConversation
        }
      >
        <View
          style={[
            styles.buttonInner,
            conversation.status === 'connected' && styles.buttonInnerActive,
            !isConnected && styles.buttonInnerDisabled,
          ]}
        >
          <Mic
            size={32}
            color="#E2E8F0"
            strokeWidth={1.5}
            style={styles.buttonIcon}
          />
        </View>
      </Pressable>
      {statusMessage ? (
        <Text style={styles.statusText}>{statusMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  callButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  callButtonDisabled: {
    opacity: 0.5,
  },
  buttonInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 5,
  },
  buttonInnerActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  buttonInnerDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonIcon: {
    transform: [{ translateY: 2 }],
  },
  statusText: {
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: -16,
    marginBottom: 16,
    textAlign: 'center',
  }
});