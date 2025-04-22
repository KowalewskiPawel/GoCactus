import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface MultiClickButtonProps {
  onPress: () => void;
  text: string;
  style?: any;
  textStyle?: any;
}

/**
 * A button component that can be used to simulate multiple quick clicks
 */
export const MultiClickButton = ({ onPress, text, style, textStyle }: MultiClickButtonProps) => {
  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, textStyle]}>{text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#E91E63',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});