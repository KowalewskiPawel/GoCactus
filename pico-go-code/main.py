from machine import UART, Pin, ADC
from Motor import PicoGo
from ws2812 import NeoPixel
import ujson
import utime

# Battery monitoring
bat = ADC(Pin(26))
temp = ADC(4)

# Initialize robot
M = PicoGo()
uart = UART(0, 115200)     # init with given baudrate
led = Pin(25, Pin.OUT)
led.value(1)
BUZ = Pin(4, Pin.OUT)
BUZ.value(0)

# GPIO 15 for toy control (K2 connection)
k2 = Pin(15, Pin.OUT)

# Button control functions - exactly as in the working example
def press_button():
    uart.write("{\"State\":\"[INFO] Simulating button press (connecting K2 to GND)\"}")
    k2.init(Pin.OUT)
    k2.value(0)

def release_button():
    uart.write("{\"State\":\"[INFO] Releasing button (disconnecting K2)\"}")
    k2.init(Pin.IN)

# Start with button released
release_button()

# Initialize RGB LEDs
strip = NeoPixel()
strip.pixels_set(0, strip.BLACK)
strip.pixels_set(1, strip.BLACK)
strip.pixels_set(2, strip.BLACK)
strip.pixels_set(3, strip.BLACK)
strip.pixels_show()

# Speed settings
LOW_SPEED = 30
MEDIUM_SPEED = 50
HIGH_SPEED = 80

speed = 50
t = 0

while True:
    s = uart.read()
    if s != None:
        try:
            j = ujson.loads(s)
            
            # Movement commands
            cmd = j.get("Forward")
            if cmd != None:
                if cmd == "Down":
                    M.forward(speed)
                    uart.write("{\"State\":\"Forward\"}")
                elif cmd == "Up":
                    M.stop()
                    uart.write("{\"State\":\"Stop\"}")
                    
            cmd = j.get("Backward")
            if cmd != None:
                if cmd == "Down":
                    M.backward(speed)
                    uart.write("{\"State\":\"Backward\"}")
                elif cmd == "Up":
                    M.stop()
                    uart.write("{\"State\":\"Stop\"}")
             
            cmd = j.get("Left")
            if cmd != None:
                if cmd == "Down":
                    M.left(20)
                    uart.write("{\"State\":\"Left\"}")
                elif cmd == "Up":
                    M.stop()
                    uart.write("{\"State\":\"Stop\"}")
                     
            cmd = j.get("Right")
            if cmd != None:
                if cmd == "Down":
                    M.right(20)
                    uart.write("{\"State\":\"Right\"}")
                elif cmd == "Up":
                    M.stop()
                    uart.write("{\"State\":\"Stop\"}")
          
            # Speed commands
            cmd = j.get("Low")
            if cmd == "Down":
                uart.write("{\"State\":\"Low\"}")
                speed = LOW_SPEED

            cmd = j.get("Medium")
            if cmd == "Down":
                uart.write("{\"State\":\"Medium\"}")
                speed = MEDIUM_SPEED

            cmd = j.get("High")
            if cmd == "Down":
                uart.write("{\"State\":\"High\"}")
                speed = HIGH_SPEED
            
            # Buzzer commands
            cmd = j.get("BZ")
            if cmd != None:
                if cmd == "on":
                    BUZ.value(1)
                    uart.write("{\"BZ\":\"ON\"}")
                    uart.write("{\"State\":\"BZ:ON\"}")
                elif cmd == "off":
                    BUZ.value(0)
                    uart.write("{\"BZ\":\"OFF\"}")
                    uart.write("{\"State\":\"BZ:OFF\"}")
            
            # LED commands
            cmd = j.get("LED")
            if cmd != None:
                if cmd == "on":
                    led.value(1)
                    uart.write("{\"LED\":\"ON\"}")
                    uart.write("{\"State\":\"LED:ON\"}")
                elif cmd == "off":
                    led.value(0)
                    uart.write("{\"LED\":\"OFF\"}")
                    uart.write("{\"State\":\"LED:OFF\"}")
            
            # RGB LED commands
            cmd = j.get("RGB")
            if cmd != None:
                rgb = tuple(eval(cmd))
                strip.pixels_set(0, rgb)
                strip.pixels_set(1, rgb)
                strip.pixels_set(2, rgb)
                strip.pixels_set(3, rgb)
                strip.pixels_show()
                uart.write("{\"State\":\"RGB:("+cmd+")\"}")
                
            # Toy control commands
            cmd = j.get("ToyGPIO15")
            if cmd != None:
                if cmd == "on":
                    # Use the exact press_button function
                    press_button()
                    uart.write("{\"ToyGPIO15\":\"ON\"}")
                elif cmd == "off":
                    # Use the exact release_button function
                    release_button()
                    uart.write("{\"ToyGPIO15\":\"OFF\"}")
            
            cmd = j.get("ToyGPIO15Pulse")
            if cmd == "pulse":
                # Use the exact sequence from your working example
                uart.write("{\"State\":\"[SETUP] Starting toy pulse sequence\"}")
                release_button()
                utime.sleep(2)
                press_button()
                utime.sleep(2)
                release_button()
                uart.write("{\"State\":\"[DONE] Cycle complete\"}")
                
        except Exception as e:
            print("Error:", e)
    
    # Status update every 3 seconds - simplified without LCD
    if (utime.ticks_ms() - t) > 3000:
        t = utime.ticks_ms()
        reading = temp.read_u16() * 3.3 / (65535)
        temperature = 27 - (reading - 0.706)/0.001721
        v = bat.read_u16() * 3.3 / 65535 * 2
        p = (v - 3) * 100 / 1.2
        if p < 0: p = 0
        if p > 100: p = 100
        
        # Send status over Bluetooth
        status = "{\"Battery\":\"" + str(round(p, 1)) + "%\",\"Voltage\":\"" + str(round(v, 2)) + "V\",\"Temp\":\"" + str(round(temperature, 1)) + "C\"}"
        uart.write(status)