/**************************************************************************************************************************************
This main program serves to schedule an action containing the following events:
1. polling all available meteocontrol (version 1.52/1.53) sensors to retrieve the actual external temperatur and irradiance and etc.;
2. sorting these values according a defined format into a data line;
3. append the lines into a csv file;
4. upload the files including all history files since breakdown.
***************************************************************************************************************************************/

/****************************************Variables and constants*************************************************************************************/
/*Import a pure JavaScript implementation of MODBUS-RTU (Serial and TCP) for NodeJS
his class makes it fun and easy to communicate with electronic devices such as irrigation controllers, protocol droids and robots. 
It talks with industrial electronic devices that use a serial line (e.g. RS485, RS232). 
*/
var ModbusRTU = require("modbus-serial");
/*Import module to create file system*/
var fs = require('fs');
/*Import module to create FTP client*/
var ftpClient = require('ftp');
/*Import module for file logging*/
var Logger = require('filelogger');

/*Column titles of slave sensor data in csv file*/
const title = '#Time;WSP;WD;PV Temp;Amp Temp;Radiation;Status \n';

/*create an empty modbus client for the sensor based on the module modbus-serial*/
var modbusSensorClient = new ModbusRTU();

/*configure the FTP client*/
var config = { 
                  host: "192.168.32.18", 
                  port: 21, // defaults to 21
                  user: "fehuser", // defaults to "anonymous"
                  password: "Anfang123" // defaults to "@anonymous"
         };
ftp = new ftpClient();

//var networkErrors = ["ESOCKETTIMEDOUT", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"];
/*create logger*/
logger = new Logger ("debug", "debug",  "log/polling_meteocontrol_sensors");

/*title of the master RaspberryPi in csv file*/
var titleRaspberry = '#RaspberryPi ESN';

/*Some to be used global variables*/
var toUploadFilesSinceBreakdown = new Array();
var actualHash = {}; // Hashtable for the actual retrieved data of retrieved devices this moment
var fullHash = {}; // Hashtable for all retrieved data of retrieved devices this day
var filename = '';
var counter = 0;
var temp='';
/***********************************************end of variables and constants****************************************************************************************/

/******************* MAIN BLOCK open connection to the serial port of sensor and execute all actions from reading to file uploading*******************/
try{
	retrieveSerialNumber();
     connect485port();
}
catch(err){
            logger.log('warn', err.message);
            closeAll();
            return;
}
/*************************** end of MAIN BLOCK**********************************************************************************************************/

function retrieveSerialNumber(){
		  const exec = require( 'child_process' ).exec;
          exec('cat /proc/cpuinfo | grep Serial', (error, stdout, stderr) => {
                     if(error||stderr){
                               logger.log('error', error.message);
                               return new Error(error);
                     }
           titleRaspberry+=stdout.replace('Serial', '').trim()+'\n';// this is your RPI serial number
           logger.log("info", 'connected '+titleRaspberry);
         });
         return titleRaspberry;
}

function connect485port(){
		  modbusSensorClient.connectRTUBuffered('/dev/ttyUSB0', { baudRate: 19200 })
		 .then(executePolling, error=>{logger.log('error', 'RaspberryPi doesnot find RS485 serial port.\n'); });
}


function executePolling(){  
	                       //connect the FTP server, if fails then always try it in the background seperately
		                   FTPconnect();
		                   ftp.on('error', function(){ 
			                         logger.log("error", 'no ftp connection, try to reconnect...'); 
			                         setInterval(FTPconnect, 30000);
			                         //schedule reading every 1 minutes
                                     setInterval(polling_read_register, 30000);    
			                        }    
	                            );
                          // schedule uploading every 2 minutes 1 second if ftp connected
                          ftp.on('ready', function(){ 
			  			            // schedule reading every 1 minutes
                                    setInterval(polling_read_register, 30000);
                                    // schedule uploading every 5 minutes
			                        setInterval(uploadSensorDataToFTP, 301000);
			                        }
	                            );
}

function FTPconnect(){
	ftp.connect(config); 
} 

/*Resursive function to read each available device*/
function  polling_read_register(){ 
		        logger.log('info', 'try to read the device ');
		        modbusSensorClient.setID(10);
		        modbusSensorClient.setTimeout(1000);
		       //write file	
		       var actualDatum = new Date().toLocaleString().substring(0,11).trim();
		       filename='polling_sensors_result'+actualDatum+'.csv'
		       //check if a new day starts
		       if (!fs.existsSync('/home/pi/wei/ueberwachung/csv/'+filename)){ 
			      // new day starts, clean all old containers/counters
			      actualHash = {};
			      fullHash = {};
			      counter = 0;
			      temp = '';
			      fs.appendFile('/home/pi/wei/ueberwachung/csv/'+filename, titleRaspberry, (err) => {
				        if (err) {
    						      logger.log('error', new Date().toLocaleString()+' error during appending data' +err.message);			       
				        }
			          }); 
		        }	
		        else{
			         fs.unlinkSync('/home/pi/wei/ueberwachung/csv/'+filename); //delete an existing file
			         fs.appendFile('/home/pi/wei/ueberwachung/csv/'+filename, titleRaspberry, (err) => {
				            if (err) {
    						          logger.log('error', new Date().toLocalesString()+' error during appending data' +err.data);			       
					         }
			         }); 
		        }
		        //read the 3 important registers starting at address 0
		        //for read only registers, meteocontrol supports the command/function code 0x04 i.e. READING  INPUT REGISTERS
		        modbusSensorClient.readInputRegisters(0, 3, (error, data) => {
					        if(error){
						           logger.log('error', 'error during reading: ' +error.data);				
					         }
					         else{
						          logger.log('info', 'sensor read: ' +data.data);
						          var WSP = 0; // default
						          var WD = 0;  // default
						          // independing on sensor version, always read the first 3 values
						          var PVtemp = (data.data[2] * 0.1 -25).toFixed(1);  
						          var Amptemp = (data.data[1] * 0.1 -25).toFixed(1);
						          var Radiation = (data.data[0] * 0.1).toFixed(1);
						          var status = 0; // 0 run, 1 error
					    
					              var tilteSensor = '#Sensor'+ modbusSensorClient.getID() +' ESN: 123456678 \n';            
						          var id = '<'+modbusSensorClient.getID()+'>';
						          var actualData=new Date().toLocaleString()+';'+WSP+';'+WD+';'+PVtemp+';'+Amptemp+';'+Radiation+';'+status+'\n';
					              if(!temp.includes(id)){ 
							          temp+=id;
							          actualHash[id] = tilteSensor + title + actualData;
							          fullHash[id] =  tilteSensor + title + actualData;
					               }	
					               else{
							             actualHash[id] = tilteSensor + title + actualData;
							             fullHash[id] = fullHash[id] + actualData;						   
						          }
					      			
				 
                                         for (var key in fullHash) {
										       logger.log('info', 'write into csv:\n'+fullHash[key]);
                                               fs.appendFile('/home/pi/wei/ueberwachung/csv/'+filename, fullHash[key], (err) => {
										                 if (err) {
    								                               logger.log('error', 'error during appending data: ' +err.data);			       
										                  }}); 
                                         }             
							        
					          }	
			});   
}

function uploadSensorDataToFTP(){             
		      //first, upload all files since breakdown
		      if(toUploadFilesSinceBreakdown.length>0){
			      toUploadFilesSinceBreakdown.forEach((element) => {
				  ftp.put('/home/pi/wei/ueberwachung/csv/'+element, 
                     '/develop/sensor.csv/'+element, 
                      (error) => {
			                  logger.log('error', 'error during upload: '+error); 
		              }); 
                  });
			       toUploadFilesSinceBreakdown = new Array();
		       }
		  
		       //second, upload the actual file
	           var output = titleRaspberry;
	           for (var key in fullHash) {
                     output+=fullHash[key];
                }
              if(output.length>titleRaspberry.length){
				   logger.log('info', 'upload the fresh csv....');
                   ftp.put(output, 
                     '/develop/sensor.csv/'+filename, 
                      function (error) {
						  if(error){
			                  logger.log('error', 'error during upload: '+error);		                  		               
			                  //save the to be uploaded file names if breakdown
                              toUploadFilesSinceBreakdown.push(filename);
					      }
		        });     
			}          
}

/*Shut the sensor and ftp client*/
function closeAll() {
	      ftp.end();
          modbusSensorClient.close(callback=>{logger.log('info', 'RS485 connection is closed');});
}
/**************************************************end of program****************************************************************************************************/
