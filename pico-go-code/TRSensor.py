from machine import I2C
import machine
import time

#i2c address
ADS_I2C_ADDRESS                   = 0x48

#Pointer Register
ADS_POINTER_CONVERT               = 0x00
ADS_POINTER_CONFIG                = 0x01
ADS_POINTER_LOWTHRESH             = 0x02  
ADS_POINTER_HIGHTHRESH            = 0x03

#Config Register
ADS_CONFIG_OS_BUSY                  = 0x0000      #Device is currently performing a conversion
ADS_CONFIG_OS_NOBUSY                = 0x8000      #Device is not currently performing a conversion              
ADS_CONFIG_OS_SINGLE_CONVERT        = 0x8000      #Start a single conversion (when in power-down state)  
ADS_CONFIG_OS_NO_EFFECT             = 0x0000      #No effect
ADS_CONFIG_MUX_MUL_0_1              = 0x0000      #Input multiplexer,AINP = AIN0 and AINN = AIN1(default)
ADS_CONFIG_MUX_MUL_0_3              = 0x1000      #Input multiplexer,AINP = AIN0 and AINN = AIN3
ADS_CONFIG_MUX_MUL_1_3              = 0x2000      #Input multiplexer,AINP = AIN1 and AINN = AIN3
ADS_CONFIG_MUX_MUL_2_3              = 0x3000      #Input multiplexer,AINP = AIN2 and AINN = AIN3
ADS_CONFIG_MUX_SINGLE_0             = 0x4000      #SINGLE,AIN0
ADS_CONFIG_MUX_SINGLE_1             = 0x5000      #SINGLE,AIN1
ADS_CONFIG_MUX_SINGLE_2             = 0x6000      #SINGLE,AIN2
ADS_CONFIG_MUX_SINGLE_3             = 0x7000      #SINGLE,AIN3
ADS_CONFIG_PGA_6144                 = 0x0000      #Gain= +/- 6.144V
ADS_CONFIG_PGA_4096                 = 0x0200      #Gain= +/- 4.096V
ADS_CONFIG_PGA_2048                 = 0x0400      #Gain= +/- 2.048V(default)
ADS_CONFIG_PGA_1024                 = 0x0600      #Gain= +/- 1.024V
ADS_CONFIG_PGA_512                  = 0x0800      #Gain= +/- 0.512V
ADS_CONFIG_PGA_256                  = 0x0A00      #Gain= +/- 0.256V
ADS_CONFIG_MODE_CONTINUOUS          = 0x0000      #Device operating mode:Continuous-conversion mode        
ADS_CONFIG_MODE_NOCONTINUOUS        = 0x0100      #Device operating mode：Single-shot mode or power-down state (default)
ADS_CONFIG_DR_RATE_128              = 0x0000      #Data rate=128SPS
ADS_CONFIG_DR_RATE_250              = 0x0020      #Data rate=250SPS
ADS_CONFIG_DR_RATE_490              = 0x0040      #Data rate=490SPS
ADS_CONFIG_DR_RATE_920              = 0x0060      #Data rate=920SPS
ADS_CONFIG_DR_RATE_1600             = 0x0080      #Data rate=1600SPS
ADS_CONFIG_DR_RATE_2400             = 0x00A0      #Data rate=2400SPS
ADS_CONFIG_DR_RATE_3300             = 0x00C0      #Data rate=3300SPS
ADS_CONFIG_COMP_MODE_WINDOW         = 0x0010      #Comparator mode：Window comparator
ADS_CONFIG_COMP_MODE_TRADITIONAL    = 0x0000      #Comparator mode：Traditional comparator (default)
ADS_CONFIG_COMP_POL_LOW             = 0x0000      #Comparator polarity：Active low (default)
ADS_CONFIG_COMP_POL_HIGH            = 0x0008      #Comparator polarity：Active high
ADS_CONFIG_COMP_LAT                 = 0x0004      #Latching comparator 
ADS_CONFIG_COMP_NONLAT              = 0x0000      #Nonlatching comparator (default)
ADS_CONFIG_COMP_QUE_ONE             = 0x0000      #Assert after one conversion
ADS_CONFIG_COMP_QUE_TWO             = 0x0001      #Assert after two conversions
ADS_CONFIG_COMP_QUE_FOUR            = 0x0002      #Assert after four conversions
ADS_CONFIG_COMP_QUE_NON             = 0x0003      #Disable comparator and set ALERT/RDY pin to high-impedance (default)

Config_Set = 0

class ADS1015(object):
    def __init__(self,i2c_bus=1,addr=ADS_I2C_ADDRESS):
        self.i2c = I2C(i2c_bus)
        self.addr = addr
        
    def ADS1015_Set_Channel(self,channel):                    #Read single channel data
        data=0
        Config_Set =  ( ADS_CONFIG_MODE_NOCONTINUOUS        |   #mode：Single-shot mode or power-down state    (default)
                        ADS_CONFIG_PGA_4096                 |   #Gain= +/- 4.096V                              (default)
                        ADS_CONFIG_COMP_QUE_NON             |   #Disable comparator                            (default)
                        ADS_CONFIG_COMP_NONLAT              |   #Nonlatching comparator                        (default)
                        ADS_CONFIG_COMP_POL_LOW             |   #Comparator polarity：Active low               (default)
                        ADS_CONFIG_COMP_MODE_TRADITIONAL    |   #Traditional comparator                        (default)
                        ADS_CONFIG_DR_RATE_3300             )   #Data rate=1600SPS                             (default)
        if channel == 0:
            Config_Set |= ADS_CONFIG_MUX_SINGLE_0
        elif channel == 1:
            Config_Set |= ADS_CONFIG_MUX_SINGLE_1
        elif channel == 2:
            Config_Set |= ADS_CONFIG_MUX_SINGLE_2
        elif channel == 3:
            Config_Set |= ADS_CONFIG_MUX_SINGLE_3
        Config_Set |=ADS_CONFIG_OS_SINGLE_CONVERT
        self._write_word(ADS_POINTER_CONFIG,Config_Set)
        #time.sleep(0.01)
        #data=self._read_u16(ADS_POINTER_CONVERT)>>4
        #return data
    
    def _read_u16(self,cmd):
        data = self.i2c.readfrom_mem(self.addr, cmd, 2)
        return ((data[0] * 256 ) + data[1])
    
    def _write_word(self, cmd, val):
        temp = [0,0]
        temp[1] = val & 0xFF
        temp[0] =(val & 0xFF00) >> 8
        self.i2c.writeto_mem(self.addr,cmd,bytes(temp))
        
class TRSensor(ADS1015):
    def __init__(self):
        self.numSensors = 5
        self.calibratedMin = [0] * self.numSensors
        self.calibratedMax = [1023] * self.numSensors
        self.last_value = 0
        super().__init__()
        self.adc1 = machine.ADC(27)
        self.adc2 = machine.ADC(28)
        
    """
    Reads the sensor values into an array. There *MUST* be space
    for as many values as there were sensors specified in the constructor.
    Example usage:
    unsigned int sensor_values[8];9
    sensors.read(sensor_values);
    The values returned are a measure of the reflectance in abstract units,
    with higher values corresponding to lower reflectance (e.g. a black
    surface or a void).
    """     
    def AnalogRead(self):
        value = [0]*(self.numSensors)
        
        value[0] = int(self.adc1.read_u16()*1024/0x10000)
        self.ADS1015_Set_Channel(0)
        value[1] = int((self._read_u16(ADS_POINTER_CONVERT)>>4)*1024/1650)   #Useless data
        self.ADS1015_Set_Channel(1)
        value[1] = int((self._read_u16(ADS_POINTER_CONVERT)>>4)*1024/1650)   #channel 0
        self.ADS1015_Set_Channel(2)
        value[2] = int((self._read_u16(ADS_POINTER_CONVERT)>>4)*1024/1650)   #channel 1
        self.ADS1015_Set_Channel(3)
        value[3] = int((self._read_u16(ADS_POINTER_CONVERT)>>4)*1024/1650)   #channel 2
        value[4] = int(self.adc2.read_u16()*1024/0x10000)
        
        
        return value
    
    """
    Reads the sensors 10 times and uses the results for
    calibration.  The sensor values are not returned; instead, the
    maximum and minimum values found over time are stored internally
    and used for the readCalibrated() method.
    """
    def calibrate(self):
        max_sensor_values = [0]*self.numSensors
        min_sensor_values = [0]*self.numSensors
        for j in range(0,10):
        
            sensor_values = self.AnalogRead();
            
            for i in range(0,self.numSensors):
            
                # set the max we found THIS time
                if((j == 0) or max_sensor_values[i] < sensor_values[i]):
                    max_sensor_values[i] = sensor_values[i]

                # set the min we found THIS time
                if((j == 0) or min_sensor_values[i] > sensor_values[i]):
                    min_sensor_values[i] = sensor_values[i]

        # record the min and max calibration values
        for i in range(0,self.numSensors):
            if(min_sensor_values[i] > self.calibratedMin[i]):
                self.calibratedMin[i] = min_sensor_values[i]
            if(max_sensor_values[i] < self.calibratedMax[i]):
                self.calibratedMax[i] = max_sensor_values[i]
        
    """
    Returns values calibrated to a value between 0 and 1000, where
    0 corresponds to the minimum value read by calibrate() and 1000
    corresponds to the maximum value.  Calibration values are
    stored separately for each sensor, so that differences in the
    sensors are accounted for automatically.
    
    """  
    def readCalibrated(self):
        value = 0
        sensor_values = self.AnalogRead()
        
        for i in range (0,self.numSensors):
            denominator = self.calibratedMax[i] - self.calibratedMin[i]

            if(denominator != 0):
                value = (sensor_values[i] - self.calibratedMin[i])* 1000 / denominator

            if(value < 0):
                value = 0
            elif(value > 1000):
                value = 1000

            sensor_values[i] = int(value)

        return sensor_values

    """
    Operates the same as read calibrated, but also returns an
    estimated position of the robot with respect to a line. The
    estimate is made using a weighted average of the sensor indices
    multiplied by 1000, so that a return value of 0 indicates that
    the line is directly below sensor 0, a return value of 1000
    indicates that the line is directly below sensor 1, 2000
    indicates that it's below sensor 2000, etc.  Intermediate
    values indicate that the line is between two sensors.  The
    formula is:

       0*value0 + 1000*value1 + 2000*value2 + ...
       --------------------------------------------
             value0  +  value1  +  value2 + ...

    By default, this function assumes a dark line (high values)
    surrounded by white (low values).  If your line is light on
    black, set the optional second argument white_line to true.  In
    this case, each sensor value will be replaced by (1000-value)
    before the averaging.
    """
    def readLine(self, white_line = 0):
        sensor_values = self.readCalibrated()
        avg = 0
        sum = 0
        on_line = 0
        for i in range(0,self.numSensors):
            value = sensor_values[i]
            if(white_line):
                value = 1000-value
            # keep track of whether we see the line at all
            if(value > 200):
                on_line = 1
                
            # only average in values that are above a noise threshold
            if(value > 50):
                avg += value * (i * 1000);  # this is for the weighted total,
                sum += value;               # this is for the denominator 

        if(on_line != 1):
            # If it last read to the left of center, return 0.
            if(self.last_value < (self.numSensors - 1)*1000/2):
                #print("left")
                self.last_value = 0;

            # If it last read to the right of center, return the max.
            else:
                #print("right")
                self.last_value = (self.numSensors - 1)*1000
        else:
            self.last_value = avg/sum

        return int(self.last_value),sensor_values

if __name__ == '__main__':

    print("\nTRSensor Test Program ...\r\n")
    TRS=TRSensor()
    while True:
        print(TRS.AnalogRead())
        time.sleep(0.1)
                