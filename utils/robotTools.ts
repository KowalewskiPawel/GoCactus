/**
 * Utility functions for controlling the robot
 */

// Command helpers for robot movement
export const moveForward = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, duration = 1500) => {
    await sendCommand({ Forward: "Down" });
    setTimeout(() => sendCommand({ Forward: "Up" }), duration);
    return 'Moving forward';
  };
  
  export const moveBackward = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, duration = 1500) => {
    await sendCommand({ Backward: "Down" });
    setTimeout(() => sendCommand({ Backward: "Up" }), duration);
    return 'Moving backward';
  };
  
  export const turnLeft = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, duration = 1000) => {
    await sendCommand({ Left: "Down" });
    setTimeout(() => sendCommand({ Left: "Up" }), duration);
    return 'Turning left';
  };
  
  export const turnRight = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, duration = 1000) => {
    await sendCommand({ Right: "Down" });
    setTimeout(() => sendCommand({ Right: "Up" }), duration);
    return 'Turning right';
  };
  
  export const stopRobot = async (sendCommand: (cmd: Record<string, string>) => Promise<void>) => {
    await sendCommand({ Forward: "Up" });
    await sendCommand({ Backward: "Up" });
    await sendCommand({ Left: "Up" });
    await sendCommand({ Right: "Up" });
    return 'Stopped';
  };
  
  // Color control
  export const colorMap: Record<string, string> = {
    'red': '(255,0,0)',
    'green': '(0,255,0)',
    'blue': '(0,0,255)',
    'yellow': '(255,255,0)',
    'cyan': '(0,255,255)',
    'purple': '(255,0,255)',
    'white': '(255,255,255)',
    'off': '(0,0,0)',
  };
  
  export const setColor = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, color: string) => {
    const rgbValue = colorMap[color.toLowerCase()] || '(255,255,255)';
    await sendCommand({ RGB: rgbValue });
    return `Color set to ${color}`;
  };
  
  // Speed control
  export const speedMap: Record<string, string> = {
    'low': 'Low',
    'medium': 'Medium',
    'high': 'High',
  };
  
  export const setSpeed = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, level: string) => {
    const speedCommand = speedMap[level.toLowerCase()] || 'Medium';
    await sendCommand({ [speedCommand]: "Down" });
    return `Speed set to ${level}`;
  };
  
  // Buzzer control
  export const setBuzzer = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, state: boolean) => {
    const buzzerState = state ? 'on' : 'off';
    await sendCommand({ BZ: buzzerState });
    return `Buzzer turned ${buzzerState}`;
  };
  
  // Toy control
  export const activateToy = async (sendCommand: (cmd: Record<string, string>) => Promise<void>, duration = 2000) => {
    await sendCommand({ ToyGPIO15: "on" });
    setTimeout(() => sendCommand({ ToyGPIO15: "off" }), duration);
    return 'Toy activated';
  };
  
  export const pulseToy = async (sendCommand: (cmd: Record<string, string>) => Promise<void>) => {
    await sendCommand({ ToyGPIO15Pulse: "pulse" });
    return 'Toy pulsed';
  };
  
  // Parse voice commands
  export const parseVoiceCommand = async (
    command: string,
    sendCommand: (cmd: Record<string, string>) => Promise<void>
  ): Promise<string> => {
    const cmd = command.toLowerCase();
    
    // Movement commands
    if (cmd.includes('forward') || cmd.includes('ahead')) {
      return moveForward(sendCommand);
    } else if (cmd.includes('backward') || cmd.includes('back')) {
      return moveBackward(sendCommand);
    } else if (cmd.includes('left')) {
      return turnLeft(sendCommand);
    } else if (cmd.includes('right')) {
      return turnRight(sendCommand);
    } else if (cmd.includes('stop')) {
      return stopRobot(sendCommand);
    }
    
    // Color commands
    for (const color of Object.keys(colorMap)) {
      if (cmd.includes(color)) {
        return setColor(sendCommand, color);
      }
    }
    
    // Speed commands
    if (cmd.includes('slow') || (cmd.includes('speed') && cmd.includes('low'))) {
      return setSpeed(sendCommand, 'low');
    } else if (cmd.includes('speed') && cmd.includes('medium')) {
      return setSpeed(sendCommand, 'medium');
    } else if (cmd.includes('fast') || (cmd.includes('speed') && cmd.includes('high'))) {
      return setSpeed(sendCommand, 'high');
    }
    
    // Buzzer commands
    if (cmd.includes('buzzer on') || cmd.includes('beep')) {
      return setBuzzer(sendCommand, true);
    } else if (cmd.includes('buzzer off') || cmd.includes('silent')) {
      return setBuzzer(sendCommand, false);
    }
    
    // Toy commands
    if (cmd.includes('activate toy')) {
      return activateToy(sendCommand);
    } else if (cmd.includes('pulse toy')) {
      return pulseToy(sendCommand);
    }
    
    return 'Command not recognized';
  };
  
  // Export all functions as a default object
  const robotTools = {
    moveForward,
    moveBackward,
    turnLeft,
    turnRight,
    stopRobot,
    setColor,
    setSpeed,
    setBuzzer,
    activateToy,
    pulseToy,
    parseVoiceCommand
  };
  
  export default robotTools;