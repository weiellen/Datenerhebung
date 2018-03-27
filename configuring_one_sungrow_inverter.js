/**********************************************************************************************************************************************************************
This main program serves to schedule an action for a certain available inverter containing the following events:
1. Confirming if the inverter is active;
2. If active then enable power limitation at adress 5007-1 = 5006;
   Finally set Power limitation at adress 5008-1=5007 to the given value from properties or Web-UI;
*************************************************************************************************************************************************************************/

/****************************************Variables and constants*********************************************************************************************************/
/*Column titles of slave inverter data in csv file*/
const title = '#Time;Upv1;Upv2;Upv3;Upv4;Upv5;Upv6;Ipv1;Ipv2;Ipv3;Ipv4;Ipv5;Ipv6;Uac1;Uac2;Uac3;Iac1;Iac2;Iac3;Status;Error;Temp;cos;fac;Pac;Qac;Eac;Cycle Time \n';
/*Import a pure NodeJS implementation of MODBUS-RTU (Serial and TCP) to communicate with electronic devices such as irrigation controllers, protocol droids and robots, 
 * which talks with industrial electronic devices that use a serial line (e.g. RS485, RS232). 
*/
var ModbusRTU = require("modbus-serial");
/*Import module for file logging*/
var Logger = require('filelogger');
/* Import module for properties reading*/
var PropertiesReader = require('properties-reader');
/* Read properties e.g. reading frequence from external file */
var properties = PropertiesReader('/home/pi/Datenerhebung/ueberwachung/resource/properties'); 
/*create an empty modbus client*/
var modbusInverterClient = new ModbusRTU();
//input inverter id from the command line or web gui
var inputDeviceID = process.argv[2];
/*create logger*/
logger = new Logger ("debug", "debug",  "log/configuring_one_sungrow_inverter")

/* Variables from properties file*/
var projectpath='/home/pi/Datenerhebung/';
var readingFrequence = 300000;
var uploadingFrequence = 900000;
var connectingFrequence = 300000;
var notUploadedFiles;
var uploadSourceFolder=projectpath+'ueberwachung/csv/';
var uploadDestinationFolder='Frankfurt/';
var alreadyNewDay=false;
var powerLimit=1100;
/*interval objects */
var reconnectRTUintervalObject;
var reconnectFTPintervalObject;
var retrieveIdsInvervalObject;
var retryPollingRegistersInvervalObject;
/***********************************************end of variables and constants****************************************************************************************/

/***************************************ENTRY POINT********************************************************************************************************/
try{
       start();
}
catch(err){
            logger.log('warn', err.message);
            closeAll();
            return;
}
/*************************** end of ENTRY POINT**********************************************************************************************************/

/*STEP 1*/
function start(){projectpath
		  const exec = require( 'child_process' ).exec;
          exec('cat /proc/cpuinfo | grep Serial', (error, stdout, stderr) => {
                     if(error){
                               logger.log('error', error);
                               return new Error(error);
                     }
                     if(stderr){
                               logger.log('error', stderr);
                               return new Error(stderr);
                     }
                     var titleRaspberry=stdout.replace('Serial', '').trim()+'\n';
                     logger.log('info', 'connected RaspberryPi '+titleRaspberry);
                     retrieveProperties(); 
		             modbusInverterClient.connectRTUBuffered('/dev/ttyUSB0', { baudRate: 9600 })
	                .then(readInverter, error=>{logger.log('error', 'RaspberryPi doesnot find RS485 serial port.\n');})
         });
}

/*STEP2*/
function readInverter(){
	     logger.log('info', 'try to open the device with ID '+inputDeviceID+' now\n');
	     modbusInverterClient.setID(inputDeviceID);
	     var status = modbusInverterClient.readInputRegisters(5037, 1, (err, data) =>{ 
					        if(err ){

								logger.log('warn', 'Cannot find the inverter with ID '+inputDeviceID+'\n');
							}projectpath
		});
		if(status!=0){
			logger.log('info','the inverter ist not active.');
			closeAll();
		}
		else{
			enableSetting();
		}
}

/*STEP 3*/
function  enableSetting(){ 
		   logger.log('info', 'try to enable the power limit setting now.\n');
		    //var actualDatum = new Date().toLocaleString().substring(0,11).trim();
		    
	        //IMPORTANT: for writing register, sungrow supports the command codeprojectpath 0x6 i.e. WRITE REGISTER   
	        modbusInverterClient.writeRegister(5006, [170]) // 0xAA enable;   
	        .then(settingPowerLimit, error=>{logger.log('error', 'Cannot find the inverter with ID '+inputDeviceID+'\n');});      
}

/*STEP 4*/
function settingPowerLimit() {
	     logger.log('info', 'try to set the power limit now.\n');
         modbusInverterClient.writeRegisters(5007, [parseInt(powerLimit)]).then(console.log);
}


function retrieveProperties(){ 
			   if(properties!=null && properties.get("projectpath")!=0){
				   projectpath = properties.get("projectpath");
			   }
	           if(properties!=null && properties.get("check_device_id_end")!=0){
	               check_device_id_end = properties.get("check_device_id_end");
			   }
		       if(properties!=null && properties.get("notUploadedFiles")!=0){
				   notUploadedFiles = properties.get("notUploadedFiles");
			   }
	           if(properties!=null && properties.get("uploadSourceFolder")!=0){
				   uploadSourceFolder = properties.get("uploadSourceFolder");
			   }
			   if(properties!=null && properties.get("uploadDestinationFolder")!=0){
				   uploadDestinationFolder = properties.get("uploadDestinationFolder");
			   }
			   if(properties!=null && properties.get("connectingFrequence")!=0){
				   connectingFrequence = properties.get("connectingFrequence");
			   }
			   if(properties!=null && properties.get("readingFrequence")!=0){


				   readingFrequence = properties.get("readingFrequence");
			   }
			   if(properties!=null && properties.get("uploadingFrequence")!=0){
				   uploadingFrequence = properties.get("uploadingFrequence");
			   }
			   if(properties!=null && properties.get("powerLimit")!=0){
				   powerLimit = properties.get("powerLimit");
			   }
}

/*Shut the connection to inverters*/
function closeAll() {
          modbusInverterClient.close(callback=>{logger.log("info","RS485 serial port is closed.\n");});
}
/**************************************************end of program****************************************************************************************************/
