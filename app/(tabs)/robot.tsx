import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  ActivityIndicator 
} from 'react-native';
import { Stack } from 'expo-router';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

export default function RobotControlScreen() {
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Request permission on component mount
    requestPermissions();
    
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
      } else {
        console.log('Bluetooth permissions denied');
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

  return (
    <>
      <Stack.Screen options={{ title: 'Robot Controller' }} />
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
        
        {/* Toy Control (GPIO 15) */}
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
});