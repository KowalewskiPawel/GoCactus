# 🌵 Señor Cactus AI

A robot cactus with personality that integrates Raspberry Pi Pico, React Native, Bluetooth, and OpenAI's Realtime API to create an interactive, voice-controlled robot with a unique personality.

## 🌟 Overview

Señor Cactus is a mobile-controlled robot that brings a cactus toy to life with:

- Voice interactions using OpenAI's Realtime API
- Bluetooth control from a mobile app
- Driving motors and interactive features
- A spicy Mexican personality that makes interacting with it fun!

## 🚀 Features

### Voice Control
- Natural language voice interactions with OpenAI's Realtime API
- Mexican-accented personality that responds with character
- Voice-commanded movement and control

### Hardware Control
- Bluetooth connectivity for direct robot control
- Forward, backward, left, and right movement
- Speed control (Low, Medium, High)
- LED and buzzer control
- RGB LED color control
- Toy activation through GPIO

### Mobile App
- React Native application for iOS and Android
- Realtime voice interaction interface
- Manual control interface with buttons
- Color picker for RGB LEDs
- Autonomous mode
- Activity logging

## 🛠️ Technology Stack

### Robot Hardware
- Raspberry Pi Pico (RP2040)
- PicoGo robot platform
- Motors, LEDs, buzzer, and sensors
- Bluetooth module

### Mobile App
- React Native with Expo
- Bluetooth Classic integration
- OpenAI Realtime API for voice interactions
- WebRTC for voice streaming

### AI Integration
- OpenAI GPT-4o mini with Realtime capabilities
- Function calling for hardware control
- Voice synthesis and recognition

## 📱 App Setup

### Prerequisites
- Node.js and npm
- Expo CLI
- Android Studio or Xcode for native development
- A paired PicoGo robot

### Installation

1. Clone the repository:
```bash
git clone https://github.com/KowalewskiPawel/SenorCactus.AI.git
cd SenorCactus.AI
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npx expo start
```

4. Run on your device or emulator:
   - Press 'a' for Android
   - Press 'i' for iOS
   - Scan the QR code with Expo Go app

## 🤖 Robot Setup

### Prerequisites
- Raspberry Pi Pico
- PicoGo robot platform
- MicroPython environment

### Flashing the Robot

1. Connect your Raspberry Pi Pico to your computer
2. Flash MicroPython to the Pico
3. Copy the following files to the Pico:
   - `main.py` - Main control program
   - `Motor.py` - Motor control library
   - `ws2812.py` - RGB LED control
   - `TRSensor.py` - Sensor interface

### Bluetooth Pairing

1. Turn on the robot
2. Pair with the robot from your mobile device's Bluetooth settings
3. The robot's Bluetooth name will appear as "PicoGo" or similar

## 🎯 Using Señor Cactus

### Manual Control
1. Open the app and connect to your robot via Bluetooth
2. Use the directional buttons to control movement
3. Adjust speed using the speed buttons
4. Control accessories (LED, buzzer) using the corresponding buttons

### Voice Control
1. Connect to your robot via Bluetooth
2. Tap "Start Voice Assistant" to connect to the OpenAI Realtime API
3. Press and hold the microphone button to speak
4. Release to get a response from Señor Cactus
5. Ask Señor Cactus to move or perform actions:
   - "Move forward"
   - "Turn left"
   - "Change the color to blue"
   - "Make some noise"

## 🧩 Project Structure

- `app/(tabs)/` - Main app screens
  - `robot.tsx` - Robot control interface
  - `realtime-cactus.tsx` - Voice assistant interface
- `components/` - Reusable UI components
- `pico-go-code/` - Robot firmware
  - `main.py` - Main robot control program
  - `Motor.py` - Motor control library
  - `ws2812.py` - RGB LED control library

## 🔧 Customization

### Personality
You can modify Señor Cactus's personality by updating the system prompt in `app/(tabs)/realtime-cactus.tsx`:

```javascript
const systemMessage = {
  type: 'session.update',
  session: {
    instructions: `You are SEÑOR CACTUS, the world's first robotic motivational cactus with a strong Mexican accent...` 
    // Modify this to change personality
  }
};
```

### Control Functions
To add new robot functions, update both:
1. The function definitions sent to the AI in `sendFunctionDefinitions()`
2. The `handleFunctionCall()` implementation to handle the new function

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenAI for the Realtime API
- Waveshare for the PicoGo platform
- React Native and Expo communities
- All contributors to this spicy project!

## 👤 Contact

Created by Pawel Kowalewski

GitHub: 
- [SenorCactus.AI](https://github.com/KowalewskiPawel/SenorCactus.AI)
- [OpenAI-Ephemeral-Token-Generator](https://github.com/KowalewskiPawel/OpenAI-Ephemeral-Token-Generator)

---

¡Ándale! ¡Vamos a programar un cactus inteligente! 🌵✨