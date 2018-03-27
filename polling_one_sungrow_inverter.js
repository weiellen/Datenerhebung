/**********************************************************************************************************************************************************************
This main program serves to schedule the following events:
1. polling registers of a given certain available sungrow inverter to retrieve the needed data such as actual power and etc.;
2. appending the line according a defined format into a csv file for the current day;
3. upload the file to the FTP server.
*************************************************************************************************************************************************************************/

/****************************************Variables and constants*********************************************************************************************************/
/*Column titles of slave inverter data in csv file*/
const lineTitle = '#Time;Upv1;Upv2;Upv3;Upv4;Upv5;Upv6;Ipv1;Ipv2;Ipv3;Ipv4;Ipv5;Ipv6;Uac1;Uac2;Uac3;Iac1;Iac2;Iac3;Status;Error;Temp;cos;fac;Pac;Qac;Eac;Cycle Time \n';

/*Import a pure NodeJS implementation of MODBUS-RTU (Serial and TCP) to communicate with electronic devices such as irrigation controllers, protocol droids and robots, 
 * which talks with industrial electronic devices that use a serial line (e.g. RS485, RS232). 
*/
var ModbusRTU = require("modbus-serial");
/*Import module to create file system*/
var fs = require('fs');
/*Import module to create FTP client*/
var ftpClient = require('ftp');
/*Import module for file logging*/
var Logger = require('filelogger');
/* Import module for properties reading*/
var PropertiesReader = require('properties-reader');
/*create an empty modbus client*/
var modbusInverterClient = new ModbusRTU();
/*configure the FTP client*/
var config = { 
                  host: "home.china-solar.de",
                  port: 21, // defaults to 21
                  user: "fehuser", 
                  password: "Anfang123" 
         };
ftp = new ftpClient();
var properties = PropertiesReader('/home/pi/Datenerhebung/ueberwachung/resource/properties');  // TO DO: read properties e.g. reading frequence from file 
//var networkErrors = ["ESOCKETTIMEDOUT", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"];
/*title of the master RaspberryPi in csv file, ESN number will be retrieved*/
var titleRaspberry = '#RaspberryPi ESN: ';
//input inverter id from the command line or web gui
var inputDeviceID = parseInt(process.argv[2]);
var titleInverter = '#Inverter'+ inputDeviceID +' ESN: 0000'+inputDeviceID+'\n';  
var title= '';
/*create logger*/
logger = new Logger ("debug", "debug",  "log/polling_one_sungrow_inverter");
/*Array for not uploaded files since breakdown*/
var toUploadFilesSinceBreakdown = new Array();
/*Hashtable for all retrieved data this day*/
var fullHash = {}; 
/*CSV file name place holder, will be named with the current date*/
var filename = '';
//Container for already read device id
var cycleTime=1;
/* Variables from properties file*/
var projectpath='/home/pi/Datenerhebung/';
var readingFrequence = 300000;
var uploadingFrequence = 900000;
var connectingFrequence = 300000;
var notUploadedFiles;
var uploadSourceFolder=projectpath+'ueberwachung/csv/';
var uploadDestinationFolder='Frankfurt/';
var alreadyNewDay=false;
var singleDeviceID=1;
/*interval objects*/
var reconnectFTPintervalObject;
var checkWorkStateInvervalObject;
var reconnectRTUintervalObject;
var retryPollingRegistersInvervalObject;
/***********************************************end of variables and constants****************************************************************************************/

/**********************************************************Entry Point**************************************************************************************************/
try{ 
	 start();    
}
catch(err){
            logger.log('error', err.message);
            closeAll();
            return;
}
/*************************** end of Entry Point**********************************************************************************************************/

/* STEP 1 connect modbus RTU*/
function start(){
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
                    titleRaspberry+=stdout.replace('Serial', '').trim()+'\n';
                    title=titleRaspberry + titleInverter + lineTitle;
                    logger.log('info', 'connected '+titleRaspberry);
                    retrieveProperties();                            
                    //Then connect inverters
                    modbusInverterClient.connectRTUBuffered('/dev/ttyUSB0', { baudRate: 9600 })
	                .then(connectFTP, error=>{logger.log('error', 'RaspberryPi doesnot find RS485 serial port.\n');  });
         });
}

/* STEP2 */
function connectFTP(){    
              retrieveProperties();             
		      ftpConnect();             
		      //Case 1: if FTP connected
              ftp.on('ready', function(){
				                         uploadFilesSinceNetworkbreak();
				                         clearInterval(reconnectFTPintervalObject);
			                       }
	          );
	           //Case 2: if FTP conncection failed
	          ftp.on('error', function(){
				                         logger.log('error','ftp connection error');
				                         clearInterval(reconnectFTPintervalObject);
			                          }    
	              );
	           //Case 3: if FTP conncection closed
	          ftp.on('close', function(){
				                         logger.log('error','ftp connection closed');				                 
                                        //save the to be uploaded file names due to network/ftp breakdown
			                            var actualDatum = new Date().toLocaleString().substring(0,10).trim().replace(',',' ');
		                                filename='polling_sungrow_inverters_result_'+actualDatum+'.csv';
		                                if(notUploadedFiles==null||notUploadedFiles==0||notUploadedFiles==undefined){
											properties.set('notUploadedFiles', filename);
											refreshPropertiesFile('notUploadedFiles', filename);
										}
										if(notUploadedFiles.toString().indexOf(filename)<0){
			                                properties.set('notUploadedFiles', notUploadedFiles.toString()+','+filename);
                                            refreshPropertiesFile('notUploadedFiles', notUploadedFiles.toString()+','+filename);
									     }
									     logger.log('error','try to reconnect after '+parseInt(connectingFrequence/60000, 10)+' minutes');
									     clearInterval(reconnectFTPintervalObject);
									     reconnectFTPintervalObject  = setInterval(ftpConnect, connectingFrequence);
			                          }    
	             );
	             checkWorkState();
}


/* STEP 3* confirm the inverter is active*/
function checkWorkState(){  
		  modbusInverterClient.setID(inputDeviceID);
	 	  modbusInverterClient.setTimeout(1000);
	      //read work state 5038-1=5037
	      //according to the sungrwo communication protocol, communication address = protocol address -1
	      modbusInverterClient.readInputRegisters(5037, 1, (err, data) =>{  
		      if(err){
		     		  logger.log('warn', 'no device '+inputDeviceID+', retry after '+parseInt(connectingFrequence/60000, 10)+' minutes'); 
		     		  checkWorkStateInvervalObject = setInterval(checkWorkState, connectingFrequence);  
		      }
		      else{		
				    if(data.data[0]>0){ //  if the work state is not RUN 
						logger.log('warn', 'device '+inputDeviceID+ 'is not active, retry after '+parseInt(connectingFrequence/60000,10)+' minutes'); 
						//clearInterval(checkWorkStateInvervalObject);		
						//checkWorkStateInvervalObject = setInterval(checkWorkState, connectingFrequence);  
                                                setTimeout(checkWorkState, connectingFrequence); 
					}
					else{	
						  //clearInterval(checkWorkStateInvervalObject);					
				          logger.log('info', 'device '+inputDeviceID+' is found'); 			     		                  
						  pollingReadRegister();			     
						  //retryPollingRegistersInvervalObject = setInterval(pollingReadRegister, readingFrequence);  					  
				    }
		       }
		  });
 }

/* STEP 4 Resursive function to read data of this inverter*/
async function  pollingReadRegister(){ 
	       // if a new day starts, clear all hash and counter to begin a new round
		   var actualHour= new Date().getHours(); 
		   if(actualHour==0  && alreadyNewDay==false){
			   fullHash = {};
			   cycleTime=1;
			   alreadyNewDay=true;
		   }
		   var actualDatum = new Date().toLocaleDateString().trim();
	           var actualTime = new Date().toLocaleString().replace(',',' ');
		   logger.log('info', 'try to read the device with ID '+inputDeviceID);
		   await modbusInverterClient.setID(inputDeviceID);

	     //IMPORTANT: read the 39 registers starting at address 5000-1=4999
         //for reading read only register, sungrow supports the command code 0x04 i.e. READ INPUT REGISTERS   
		  await modbusInverterClient.readInputRegisters(4999, 39, (error, data) =>{  
					        if(error){
						           logger.log('error', 'error during reading: ' +error.message);	
						           retryPollingRegistersInvervalObject = setInterval(pollingReadRegister, connectingFrequence);  
                                                           setTimeout(pollingReadRegister, connectingFrequence);  
					         }
					         else{
								   //clearInterval(retryPollingRegistersInvervalObject);  	
						          //logger.log('info', 'inverter read: ' +data.data);
						           var deviceType = data.data[0];
						           var temperature = (data.data[8]*0.1).toFixed(2); 
						           // DC
                                   var upv1 = (data.data[11]*0.1).toFixed(2);  
                                   var upv2 = (data.data[13]*0.1).toFixed(2); 
                                   var upv3 = (data.data[15]*0.1).toFixed(2); 
                                   var upv4 = 0;   
                                   var upv5 = 0; 
                                   var upv6 = 0; 
                                   var ipv1 = (data.data[12]*0.1).toFixed(2);  
                                   var ipv2 = (data.data[14]*0.1).toFixed(2); 
                                   var ipv3 = (data.data[16]*0.1).toFixed(2); 
                                   var ipv4 = 0;  
                                   var ipv5 = 0;
                                   var ipv6 = 0;
                
                                   // AC
                                   var uac1 = (data.data[19]*0.1).toFixed(2);
                                   var uac2 = (data.data[20]*0.1).toFixed(2);
                                   var uac3 = (data.data[21]*0.1).toFixed(2);
                                   var iac1 = (data.data[22]*0.1).toFixed(2);  
                                   var iac2 = (data.data[23]*0.1).toFixed(2); 
                                   var iac3 = (data.data[24]*0.1).toFixed(2); 
                           
                                   var pac= (data.data[31] * 0.001).toFixed(2);
                                   var cos= (data.data[35]*0.001).toFixed(2);
                                   var fac= (data.data[36]*0.1).toFixed(2);   
                                   var status = data.data[38];cycleTime    
                                   var error = 0;             
                                   var qac= 0;
                                   var eac= 0;
					                         
						           var actualData=actualTime+';'+upv1+';'+upv2+';'+upv3+';'+upv4+';'+upv5+';'+upv6+';'
				                   +ipv1+';'+ipv2+';'+ipv3+';'+ipv4+';'+ipv5+';'+ipv6
				                   +';'+uac1+';'+uac2+';'+uac3
				                   +';'+iac1+';'+iac2+';'+iac3
				                   +';'+status+';'+error+';'+temperature+';'+cos+';'+fac+';'+pac+';'+qac+';'+eac+';'+cycleTime
				                   +'\n';			                   		   					      										
                                   fullHash[cycleTime-1] = actualData;
								   var output = '';							
	                               for (var key in fullHash) {
                                           output+=fullHash[key];                
                                   }		 
                                  // if(output.length>1){
								       logger.log('info', 'write into csv...'); 
									   output = title + output; 
		                               filename='polling_sungrow_inverter_#'+inputDeviceID+'result_'+actualDatum+'.csv';
									   fs.writeFile(uploadSourceFolder+filename,    output, (err) => {
										                 if (err) {
    								                               logger.log('error', 'error during appending data: ' +err);			       
								             }});
 								    		
							           cycleTime++;	
                                                                  setTimeout(pollingReadRegister, connectingFrequence);  
							          // schedule uploading
							          var modulo = parseInt(Number(uploadingFrequence) / Number(readingFrequence), 10); 
							          if(cycleTime>modulo && (cycleTime-1) % modulo == 0){  
								          logger.log('info', 'try to upload the fresh csv...');
									      uploadInverterDataToFTP();
						               } 								 										 
								   //}                                                   							       							        
					          }	
			});   
}

/* upload the actual file */
function uploadInverterDataToFTP(){       	    			  
               ftp.put(uploadSourceFolder+filename, 
                       uploadDestinationFolder+filename, 
                      function (error) {
						  if(error){
			                  logger.log('error', 'during uploading error:'+error);		                  		               
					      }
		             });                 
}

function retrieveProperties(){
			   if(properties!=null && properties.get("projectpath")!=0){
				   projectpath = properties.get("projectpath");
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
			   if((inputDeviceID==undefined || inputDeviceID==null)&& properties!=null && properties.get("singleDeviceID")!=0){
				   inputDeviceID = properties.get("singleDeviceID");
			   }
}

function ftpConnect(){
	logger.log('info', 'connect ftp now');
	ftp.connect(config);
}

function uploadFilesSinceNetworkbreak(){	 
	   if(notUploadedFiles!=null&&notUploadedFiles!=0){
	     var arr = (notUploadedFiles.toString()).split(',');	  
		      if(arr.length>0){
			      arr.forEach((element) => {
					  logger.log('info', 'uploading a not uploaded file '+element);				  
		               ftp.put(uploadSourceFolder+element, 
							  uploadDestinationFolder+element, 
							   (error) => {
									if(error){logger.log('error', 'from '+uploadSourceFolder+element+' to '+uploadDestinationFolder+element +' upload error: '+error); }
							   }); 
                  });
			      refreshPropertiesFile('notUploadedFiles', '');//after uploading just clean the array
		       }
		   }
}

function refreshPropertiesFile(propertyName, propertyValue){
	     var proplist = {};      
	     for(var p in properties.getAllProperties()){
			 if(propertyName==p){
				 properties.set(p, propertyValue);
				 break;
			 }
		 }
		 var output='';
		 for(var pp in properties.getAllProperties()){
			 output+=pp+'='+properties.get(pp)+'\n';
		 }
		 fs.writeFile(projectpath+'ueberwachung/resource/properties', output, (err) => {
							 if (err) {
    								    logger.log('error', 'error during appending data: ' +err.message);			       
						 }}); 
}

/*Shut the ftp client and connection to inverters */
function closeAll() {
	      ftp.end();
          modbusInverterClient.close(callback=>{logger.log('info','RS485 serial port is closed');});
}
/**************************************************end of program****************************************************************************************************/

