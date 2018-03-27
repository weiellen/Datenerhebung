/**************************************************************************************************************************************
This main program serves to schedule an action containing the following events:
1. polling all available inverters to retrieve the actual power and etc.;
2. sorting these values according a defined format into a data line;
3. append the lines into a csv file;
4. upload the files including all history files since ftp/network breakdown.
***************************************************************************************************************************************/

/****************************************Variables and constants*************************************************************************************/
/*Import a pure JavaScript implementation of MODBUS-RTU (Serial and TCP) for NodeJS
his class makes it fun and easy to communicate with electronic devices such as irrigation controllers, protocol droids and robots. 
It talks with industrial electronic devices that use a serial line (e.g. RS485, RS232). 
*/
/*Column titles of slave inverter data in csv file*/
const title = '#Time;Upv1;Upv2;Upv3;Upv4;Upv5;Upv6;Ipv1;Ipv2;Ipv3;Ipv4;Ipv5;Ipv6;Uac1;Uac2;Uac3;Iac1;Iac2;Iac3;Status;Error;Temp;cos;fac;Pac;Qac;Eac;Cycle Time \n';

var ModbusRTU = require("modbus-serial");
/*Import module to create file system*/
var fs = require('fs');
/*Import module to create FTP client*/
var ftpClient = require('ftp');
/*Import module for file logging*/
var Logger = require('filelogger');

/*create an empty modbus client for the inverter based on the module modbus-serial*/
var modbusInverterClient = new ModbusRTU();

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
logger = new Logger ('debug', 'debug',  'log/polling_huawei_inverters');

/*title of the master RaspberryPi in csv file*/
var titleRaspberry = '#RaspberryPi ESN';

/*Some to be used global variables*/
var availableDevice = new Array(); // Array for retrieved device ids
var toUploadFilesSinceBreakdown = new Array();
var actualHash = {}; // Hashtable for the actual retrieved data of retrieved devices this moment
var fullHash = {}; // Hashtable for all retrieved data of retrieved devices this day
var filename = '';
var check_device_id_start = 1;
var check_device_id_end = 20; // actually possisble slave address are between (1..247)
var deviceId = check_device_id_start;
var counter = 0;
var temp='';
var cycleTime=0;
/***********************************************end of variables and constants****************************************************************************************/

/******************* MAIN BLOCK open connection to the serial port of hub and execute all actions from reading to file uploading*******************/
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
                               logger.log('error', error);
                               return new Error(error);
                     }
           titleRaspberry+=stdout.replace('Serial', '').trim()+'\n';
           logger.log('info', 'connected '+titleRaspberry);
         });
         return titleRaspberry;
}

function connect485port(){
		modbusInverterClient.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600 })
	   .then(retrieveAvailableInverterIDs, error=>{modbusInverterClient.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 19200 }).then(retrieveAvailableInverterIDs, error=>{logger.log('error', 'RaspberryPi doesnot find RS485 serial port.\n');}); });
} 

/*Retreive IDs of all available devices*/
function retrieveAvailableInverterIDs(){ 
	      modbusInverterClient.setID(deviceId); 
	      modbusInverterClient.setTimeout(1000);
	      //read the ESN register at address 32003
        //for reading huawei supports only command code 0x03 i.e. READ HOLDING REGISTERS
        modbusInverterClient.readHoldingRegisters(32287, 1, (err, data) =>{
		      if(err){
					  logger.log('info', new Date().toLocaleString()+' no device '+deviceId); 
					  if(deviceId<check_device_id_end){
					     deviceId++;
					     retrieveAvailableInverterIDs();
				      }
				      else{//if no devices found, repeat to search from the beginevery 5 minutes  
						  if(availableDevice.length==0){
							 logger.log('info', 'no devices are found. try it after 5 minautes'); 
				             deviceId=check_device_id_start;
					         setInterval(retrieveAvailableInverterIDs, 300000);
					        }
					        else{
								 executePolling();
							}
				      }
		      }
		      else{		
	//			    if(data.data!=0 && data.data!=256){ // 0x0 initial 0x0100 starting
			//			logger.log('info', new Date().toLocaleString()+' no device '+deviceId); 
		//			}
				//	else{		 
				       logger.log('info', ' device '+deviceId+' is found'); 
					   availableDevice.push(deviceId);
				  // }
					   if(deviceId<check_device_id_end){
					     deviceId++;
					     retrieveAvailableInverterIDs();
				       }
				       else{
                            executePolling();
				         }
		     }
		});
}

 function executePolling(){
	 					    logger.log('info', availableDevice.length+' devices are found!');
					        	      modbusInverterClient.setTimeout(2000); 
	           
		                    ftpConnect();
		                    //Case 1: FTP connected, schedule polling inverters and uploading csv
                            ftp.on('ready', function(){
			  			               // schedule polling every 1 minutes
                                        setInterva(pollingReadRegister, 60000);
			                           // schedule upload every 2 minutes
			                           setInterval(uploadInverterDataToFTP, 121000);
			                       }
	                         );
		                     //Case 2: FTP conncection fails, then always try the conncection in the background seperately during polling inverters
		                     ftp.on('error', function(){
			                            logger.log('error','no ftp connection, try to reconnect...'); 
			                            setInterval(ftpConnect, 600000);
			                            //schedule polling inverters every 1 minutes
                                        setInterval(pollingReadRegister, 60000);    
			                          }    
	                         ); 
 }
 
 function ftpConnect(){
	      ftp.connect(config);
} 

/*Resursive function to read each available device*/
function  polling_read_register(){ 
		        logger.log("info", "try to read the "+(counter+1)+"th device "+availableDevice[counter]);
		        modbusInverterClient.setID(availableDevice[counter]);
		       //write file	
		       var actualDatum = new Date().toLocaleString().substring(0,11).trim();
		       filename='polling_huawei_result'+actualDatum+'.csv'
		       //check if a new day starts
		       if (!fs.existsSync('/home/pi/wei/ueberwachung/csv/'+filename)){ 
			      // new day starts, clean all old containers/counters
			      actualHash = {};
			      fullHash = {};
			      counter = 0;
			      temp = '';
			      fs.appendFile('/home/pi/wei/ueberwachung/csv/'+filename, titleRaspberry, (err) => {
				        if (err) {
    						      logger.log("error", new Date().toLocalesString()+" error during appending data" +err.data);			       
				        }
			          }); 
		        }	
		        else{
			         fs.unlinkSync('/home/pi/wei/ueberwachung/csv/'+filename); //delete an existing file
			         fs.appendFile('/home/pi/wei/ueberwachung/csv/'+filename, titleRaspberry, (err) => {
				            if (err) {
    						          logger.log("error", new Date().toLocalesString()+" error during appending data" +err.data);			       
					         }
			         }); 
		        }
		         //read the 30 register starting at address 32003
        //for reading huawei supports only command code 0x03 i.e. READ HOLDING REGISTERS
        modbusInverterClient.readHoldingRegisters(32003, 30, (err, data) =>{
		        modbusInverterClient.readInputRegisters(0, 3, (error, data) => {
					        if(error){
						           logger.log("error", new Date().toLocaleString()+" error during reading: " +error.data);				
						           //then read the next device										    
						           if(counter<availableDevice.length-1){
								        counter++; 				
								        polling_read_register();
							       }	
							       //or start next round
						           else{
							             counter=0;						 
							        }
					         }
					         else{
						          logger.log("info", new Date().toLocaleString()+" inverter read: " +data.data);
						           // U
                                   var upv1 = data.data[0];  
                                   var upv2 = data.data[2]; 
                                   var upv3 = data.data[4]; 
                                   var upv4 = 0;  
                                   var upv5 = 0;
                                   var upv6 = 0;
                                   var uac1 = 0;  
                                   var uac2 = 0;
                                   var uac3 = 0;
                 
                                   // I
                                   var ipv1 = data.data[1];  
                                   var ipv2 = data.data[3]; 
                                   var ipv3 = data.data[5]; 
                                   var ipv4 = 0;  
                                   var ipv5 = 0;
                                   var ipv6 = 0;
                                   var iac1 = 0;  
                                   var iac2 = 0;
                                   var iac3 = 0;
                 
                                   var status = 0; // 0 run, 1 error    
                                   var error = 0;   
                                   var temperature = 0;
                                   var cos= 0;
                                   var fac= 0;
                                   var pac= 0;
                                   var qac= 0;
                                   var eac= 0;
					    					    
					              var tilteSInverter = '#Inverter'+ modbusInverterClient.getID() +' ESN: 123456678 \n';            
						          var id = '<'+modbusInverterClient.getID()+'>';
						          var actualData=new Date().toLocaleString()+';'+upv1+';'+upv2+';'+upv3+';'+upv4+';'+upv5+';'+upv6+';'
				                   +ipv1+';'+ipv2+';'+ipv3+';'+ipv4+';'+ipv5+';'+ipv6
				                   +';'+uac1+';'+uac2+';'+uac3
				                   +';'+iac1+';'+iac2+';'+iac3
				                   +';'+status+';'+error+';'+temperature+';'+cos+';'+fac+';'+pac+';'+qac+';'+eac+';'+cycleTime
				                   +'\n';
					              if(!temp.includes(id)){ 
							          temp+=id;
							          actualHash[id] = tilteInverter + title + actualData;
							          fullHash[id] =  tilteInverter + title + actualData;
					               }	
					               else{
							             actualHash[id] = tilteInverter + title + actualData;
							             fullHash[id] = fullHash[id] + actualData;						   
						          }
					      			
					      			//then read the next device										    
						           if(counter<availableDevice.length-1){
								        counter++; 				
								        polling_read_register();
							       }	
							       //or write data if this round is finished
						           else{
							             counter=0;						 
                                         for (var key in fullHash) {
										       logger.log('info', 'write into csv:\n'+fullHash[key]);
                                               fs.appendFile('/home/pi/wei/ueberwachung/csv/'+filename, fullHash[key], (err) => {
										                 if (err) {
    								                               logger.log("error", " error during appending data: " +err.data);			       
										                  }}); 
                                         }             
							        }
					          }	
			});   
    });
}

function uploadInverterDataToFTP(){             
		      //first, upload all files since breakdown
		      if(toUploadFilesSinceBreakdown.length>0){
			      toUploadFilesSinceBreakdown.forEach((element) => {
				  ftp.put('/home/pi/wei/ueberwachung/csv/'+element, 
                     '/develop/inverter.csv/'+element, 
                      (error) => {
			                  logger.log("error", new Date().toLocaleString()+" upload "+error); 
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
                     '/develop/inverter.csv/'+filename, 
                      function (error) {
						  if(error){
			                  logger.log("error", new Date().toLocaleString()+" upload "+error);		                  		               
			                  //save the to be uploaded file names if breakdown
                              toUploadFilesSinceBreakdown.push('polling_devices_result'+new Date().toLocaleString().substring(0,11).trim()+'.csv');
					      }
		        });   
			}            
}

/*Shut the inverter and ftp client*/
function closeAll() {
	      ftp.end();
          modbusInverterClient.close(callback=>{logger.log('info','RS485 serial port is closed');});
}
/**************************************************end of program****************************************************************************************************/
