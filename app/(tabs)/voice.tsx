import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity,
  ScrollView, 
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Stack } from 'expo-router';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ConvAiDOMComponent from '@/components/ConvAI';
import AgentSetup from '@/components/AgentSetup';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

export default function VoiceControlScreen() {
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [agentId, setAgentId] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    // Request permission on component mount
    requestPermissions();
    
    // Load agent credentials from storage
    const loadAgentCredentials = async () => {
      try {
        const storedAgentId = await AsyncStorage.getItem('elevenlabs_agent_id');
        const storedApiKey = await AsyncStorage.getItem('elevenlabs_api_key');
        
        if (storedAgentId) {
          setAgentId(storedAgentId);
          addLog(`Loaded agent ID: ${storedAgentId.substring(0, 8)}...`);
        }
        
        if (storedApiKey) {
          setApiKey(storedApiKey);
          addLog('Loaded API key');
        }
      } catch (error) {
        console.error('Failed to load agent credentials:', error);
      }
    };
    
    loadAgentCredentials();
    
    // Cleanup when component unmounts
    return () => {
      if (selectedDevice) {
        disconnectFromDevice();
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const granted = await RNBluetoothClassic.requestBluetoothEnabled();
      if (granted) {
        console.log('Bluetooth permissions granted');
        addLog('Bluetooth permissions granted');
      } else {
        console.log('Bluetooth permissions denied');
        addLog('Bluetooth permissions denied');
        Alert.alert('Permission Required', 'Bluetooth permissions are required to control your robot.');
      }
    } catch (error: any) {
      console.error('Error requesting Bluetooth permissions:', error);
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
      Alert.alert('Not Connected', 'Please connect to your robot first.');
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

  const handleNewMessage = (message: any) => {
    setMessages(prev => [...prev, message]);
    // Also add to logs
    if (message.content) {
      addLog(`AI: ${message.content}`);
    }
  };
  
  const handleSaveAgentConfig = (newAgentId: string, newApiKey: string) => {
    setAgentId(newAgentId);
    setApiKey(newApiKey);
    addLog(`Updated agent configuration`);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Voice Controller' }} />
      <ScrollView style={styles.scrollContainer}>
        {/* Connection Section */}
        <View style={styles.section}>
          <ThemedText type="subtitle">Connection</ThemedText>
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
              <ThemedText type="defaultSemiBold">Select a device:</ThemedText>
              {devices.map((device) => (
                <TouchableOpacity
                  key={device.address}
                  style={styles.deviceItem}
                  onPress={() => connectToDevice(device)}
                  disabled={connecting}
                >
                  <ThemedText style={styles.deviceName}>{device.name}</ThemedText>
                  <ThemedText style={styles.deviceAddress}>{device.address}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Connection Status */}
          <View style={styles.statusContainer}>
            {connecting ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <ThemedText style={styles.statusText}>
                Status: {isConnected ? `Connected to ${selectedDevice?.name}` : 'Disconnected'}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Agent Setup Section */}
        <AgentSetup 
          onSave={handleSaveAgentConfig}
          defaultAgentId={agentId}
          defaultApiKey={apiKey}
        />
        
        {/* Voice Control Section */}
        <View style={styles.section}>
          <ThemedText type="subtitle">Voice Control</ThemedText>
          
          <View style={styles.voiceContainer}>
            <ThemedText style={styles.description}>
              Press the microphone button to activate the voice assistant. You can give commands to control your robot.
            </ThemedText>
            
            <View style={styles.domComponentContainer}>
              {agentId ? (
                <ConvAiDOMComponent
                  dom={{ style: styles.domComponent }}
                  platform={Platform.OS}
                  isConnected={isConnected}
                  sendBluetoothCommand={sendCommand}
                  onMessage={handleNewMessage}
                  agentId={agentId}
                  apiKey={apiKey || undefined}
                />
              ) : (
                <View style={styles.noAgentContainer}>
                  <ThemedText style={styles.noAgentText}>
                    Please configure your ElevenLabs agent ID above to use voice control.
                  </ThemedText>
                </View>
              )}
            </View>
            
            <ThemedText type="defaultSemiBold" style={styles.commandsTitle}>
              Available Voice Commands:
            </ThemedText>
            <View style={styles.commandsList}>
              <ThemedText style={styles.commandText}>• "Move forward" or "Go ahead"</ThemedText>
              <ThemedText style={styles.commandText}>• "Move backward" or "Go back"</ThemedText>
              <ThemedText style={styles.commandText}>• "Turn left" or "Turn right"</ThemedText>
              <ThemedText style={styles.commandText}>• "Stop"</ThemedText>
              <ThemedText style={styles.commandText}>• "Set speed to low/medium/high"</ThemedText>
              <ThemedText style={styles.commandText}>• "Change color to red/green/blue/etc."</ThemedText>
              <ThemedText style={styles.commandText}>• "Turn buzzer on/off"</ThemedText>
              <ThemedText style={styles.commandText}>• "Activate toy" or "Pulse toy"</ThemedText>
            </View>
          </View>
        </View>
        
        {/* Conversation Display */}
        {messages.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="subtitle">Conversation</ThemedText>
            <View style={styles.messagesContainer}>
              {messages.map((msg, index) => (
                <View key={index} style={styles.messageItem}>
                  <ThemedText style={styles.messageContent}>{msg.content}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Log Display */}
        <View style={styles.section}>
          <ThemedText type="subtitle">Activity Log</ThemedText>
          <View style={styles.logContainer}>
            {logs.map((log, index) => (
              <ThemedText key={index} style={styles.logText}>{log}</ThemedText>
            ))}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  section: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
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
  disconnectButton: {
    backgroundColor: '#F44336',
  },
  deviceList: {
    marginTop: 12,
    gap: 8,
  },
  deviceItem: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    padding: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  deviceName: {
    fontWeight: 'bold',
  },
  deviceAddress: {
    fontSize: 12,
    opacity: 0.6,
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: {
    opacity: 0.7,
  },
  voiceContainer: {
    alignItems: 'center',
    gap: 16,
  },
  description: {
    textAlign: 'center',
    marginBottom: 8,
  },
  domComponentContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  domComponent: {
    width: 120,
    height: 120,
  },
  noAgentContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  noAgentText: {
    fontSize: 12,
    textAlign: 'center',
    color: 'rgba(0, 0, 0, 0.5)',
  },
  commandsTitle: {
    marginTop: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  commandsList: {
    alignSelf: 'stretch',
    gap: 4,
  },
  commandText: {
    fontSize: 14,
  },
  messagesContainer: {
    gap: 8,
  },
  messageItem: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  messageContent: {
    fontSize: 14,
  },
  logContainer: {
    borderRadius: 4,
    padding: 8,
    maxHeight: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
    opacity: 0.8,
  },
});