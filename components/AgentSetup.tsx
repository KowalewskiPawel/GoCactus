import React, { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Text, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

interface AgentSetupProps {
  onSave: (agentId: string, apiKey: string) => void;
  defaultAgentId?: string;
  defaultApiKey?: string;
}

export default function AgentSetup({ onSave, defaultAgentId = '', defaultApiKey = '' }: AgentSetupProps) {
  const [agentId, setAgentId] = useState(defaultAgentId);
  const [apiKey, setApiKey] = useState(defaultApiKey);
  const [isEditing, setIsEditing] = useState(!defaultAgentId);

  const handleSave = async () => {
    if (!agentId.trim()) {
      Alert.alert('Error', 'Agent ID is required');
      return;
    }

    try {
      // Save to AsyncStorage for persistence
      await AsyncStorage.setItem('elevenlabs_agent_id', agentId);
      if (apiKey) {
        await AsyncStorage.setItem('elevenlabs_api_key', apiKey);
      }
      
      // Call the onSave callback
      onSave(agentId, apiKey);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save agent credentials:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">ElevenLabs Agent Configuration</ThemedText>
      
      {isEditing ? (
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Agent ID *</ThemedText>
            <TextInput
              style={styles.input}
              value={agentId}
              onChangeText={setAgentId}
              placeholder="Enter your ElevenLabs Agent ID"
              placeholderTextColor="#999"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>API Key (optional)</ThemedText>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Enter your ElevenLabs API Key"
              placeholderTextColor="#999"
              secureTextEntry
            />
          </View>
          
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Configuration</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.savedContainer}>
          <ThemedText>Agent ID: {agentId.substring(0, 8)}...{agentId.substring(agentId.length - 4)}</ThemedText>
          {apiKey && <ThemedText>API Key: ••••••••••••</ThemedText>}
          
          <TouchableOpacity 
            style={styles.editButton} 
            onPress={() => setIsEditing(true)}
          >
            <Text style={styles.editButtonText}>Edit Configuration</Text>
          </TouchableOpacity>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  formContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 12,
    borderRadius: 6,
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  savedContainer: {
    gap: 8,
    alignItems: 'center',
  },
  editButton: {
    marginTop: 8,
    backgroundColor: '#607D8B',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  editButtonText: {
    color: 'white',
    fontWeight: 'bold',
  }
});