/******************************************************************************************************
The main server sided program to offer http server, which offers html5-menue choosing to be executed scripts like polling_sungrow_inverters and etc.
* local address: http://localhost:8000
* remote address: http://172.24.0.150:8000
******************************************************************************************************/

// Load the http module to create an http server.
var http = require('http'); 
// Load the opn module wchich opens stuff like websites, files, executables. Cross-platform
var opn = require('opn');
// Load the fs module to read file stream.
var fs = require('fs')
// Load the ps-node module to check if a process is running.
var ps = require('ps-node');
/*Import module for file logging*/
var Logger = require('filelogger');
/*create logger*/
logger = new Logger ("debug", "debug",  "log/web-ui");
//check running status
var script1running = false;
var script2running = false;
var script3running = false;
var script4running = false;

// Create a function to handle every HTTP request
function handler(req, res){
   checkRunningProcess();
   
   var form = '';

  if(req.method == "GET"){ 
     fs.readFile('page/template.html', 'utf8', function (err,data) {
         if (err) {
            return console.log(err);
         }
         form+=data;  
         
         //respond
         res.setHeader('Content-Type', 'text/html');
         res.writeHead(200);
         res.end(form);
     });
  } 
  else if(req.method == 'POST'){
           //read form data
           req.on('data', function(chunk) {

             //grab form data as string
             var formdata = chunk.toString();   
             //grab checked index from client side http://172.24.0.150:8000/
             var arr = formdata.split('&');
             var a = eval(arr[0]); 
             var b = eval(arr[1]); 
             var c = eval(arr[2]); 
             var d = eval(arr[3]); 
             var e = eval(arr[4]); 
             var f = eval(arr[5]);  
             
             var result='';
             if(Number(a)==1){
				 //result+="<p><a href='http://172.24.0.150:3000' target='view_frame'>"+
                 //runPollingSungrowInverters()+"</a><p>";
                //opens the log watcher in a new window 
                 runPollingSungrowInverters(); 
                 result="http://172.24.0.150:3000";
			 }
			 if(Number(b)==1){
				 //result+="<p><a href='http://172.24.0.150:3001' target='view_frame'>"+
				 //runPollingOneSungrowInverter(c)+"</a><p>";
				//opens the log watcher in a new window 
				runPollingOneSungrowInverter(c);
                result='http://172.24.0.150:3001';			
			 }
			 if(Number(d)==1){
				 //result+="<p><a href='http://172.24.0.150:3002' target='view_frahttp://192.168.32.107:8000/me'>"+
				 //runConfiguringSungrowInverters()+"</a><p>";
				 //opens the log watcher in a new window     
				 runConfiguringSungrowInverters();
				 result='http://172.24.0.150:3002';
			 }
			 if(Number(e)==1){
				 //result+="<p><a href='http://172.24.0.150:3003' target='view_frame'>"+
				 //runConfiguringOneSungrowInverter(f)+"</a><p>";
				 //opens the log watcher in a new window     
				  runConfiguringOneSungrowInverter(f);
                  result='http://172.24.0.150:3003';
			 }

             //respond
             res.setHeader('Content-Type', 'text/html');
             res.writeHead(200, { 'Content-Type': 'text/html' });
             res.end(result);  
           });
  } 
  else {
             res.setHeader('Content-Type', 'text/html');
             res.writeHead(200, { 'Content-Type': 'text/html' });
             res.end('ok');
  };
};

// Create a server that invokes the `handler` function upon receiving a request
var server = http.createServer(handler);
server.listen(8000, function(err){
  if(err){
           console.log('Error starting http server');
  } else {
           console.log('Server running at http://172.24.0.150:8000/');
  };
});

function runPollingSungrowInverters(){
    const exec = require( 'child_process' ).exec;       
	if(script1running){
		 return 'polling_sungrow_inverters already running\n';
	}
	else{
         runScript('polling_sungrow_inverters.js', function (data, err) {
          if (err) {
			  logger.log('error', error);
			  return err;
		  }
         });
         exec('node /home/pi/Datenerhebung/logWatcherPollingSungrow/bin/www', (error, stdout, stderr) => {
                    if(error){
                               logger.log('error', error);
                               return error;
                     }
                    if (stderr){
			                    logger.log('error', stderr);
			                    return stderr;
		             }
         });
        return 'polling_sungrow_inverters now started, please check details in log watcher\n';
    }
}

function runPollingOneSungrowInverter(f){ 
	const exec = require( 'child_process' ).exec;
	if(script2running){
		 return 'polling_one_sungrow_inverter already running. \n';
	}
	else{ 
          exec('node polling_one_sungrow_inverter '+f.toString(), (error, stdout, stderr) => {
                if (error) {
			           logger.log('error', error);
			           return error;
		         }
		         else if (stderr) {
			           logger.log('error', stderr);
			           return stderr;
		          }		           
         });
         const exec2 = require( 'child_process' ).exec;
         exec2('node /home/pi/Datenerhebung/logWatcherPollingOneSungrow/bin/www', (error, stdout, stderr) => {
                            if (error) {
			                             logger.log('error', error);
			                             return err;
		                    }
		                    if (stderr) {
			                             logger.log('error', stderr);
			                             return stderr;
		                    }
        });
        return 'polling_one_sungrow_inverter now started, please check details in log watcher\n';
    }
}

//function runPollingMeteocontrolSensors(){
  //  const exec = require( 'child_process' ).exec;
  //        exec('node /home/pi/Datenerhebung/logWatcherPollingMeteocontrol/bin/www', (error, stdout, stderr) => { 
    //                 if(error||stderr){
      //                         logger.log('error', error);
        //                       return new Error(error);
          //           }
         //});   
	//if(script3running){ 
		//return 'polling_meteocontrol_isensors already running\n';
	//}
	//else{
    // Now we can run a script and invoke a callback when complete, e.g.
      //   runScript('polling_meteocontrol_sensors.js', function (err) {
        //  if (err) throw err;
        //});
        //return 'polling_meteocontrol_sensors now started, please check details in log watcher\n';
    //}
//}

function runConfiguringSungrowInverters(){
    const exec = require( 'child_process' ).exec;       
	if(script3running){
		 return 'configuring_sungrow_inverters already running\n';
	}
	else{
          runScript('configuring_sungrow_inverters.js', function (error, stdout, stderr) {
            if (error) {
			   logger.log('error', error);
			    return error;
		    }
		    if (stderr) {
			   logger.log('error', stderr);
			   return stderr;
		    }		   
          });
          exec('node /home/pi/Datenerhebung/logWatcherConfiguringSungrow/bin/www', (error, stdout, stderr) => {
                            if (error) {
			                             logger.log('error', error);
			                             return err;
		                    }
		                    else if (stderr) {
			                                  logger.log('error', stderr);
			                                  return stderr;
		                    }
                 });
           return 'configuring_sungrow_inverters now started, please check details in log watcher.\n';
    }
}


function runConfiguringOneSungrowInverter(h){ 
	const exec = require( 'child_process' ).exec;
	if(script4running){
		 return 'configuring_one_sungrow_inverter already running\n';
	}
	else{ 
          exec('node configuring_one_sungrow_inverter '+h.toString(), (error, stdout, stderr) => {
                if (error) {
			           logger.log('error', error);
			           return err;
		         }
		         if (stderr) {
			           logger.log('error', stderr);
			           return stderr;
		          }             		           
          });
          const exec2 = require( 'child_process' ).exec;
          exec2('node /home/pi/Datenerhebung/logWatcherConfiguringOneSungrow/bin/www', (error, stdout, stderr) => { 
                            if (error) {
			                             logger.log('error', error);
			                             return err;
		                    }
		                    if (stderr) { 
			                                  logger.log('error', stderr);
			                                  return stderr;
		                    }
           });
           return 'configuring_one_sungrow_inverter now started, please check details in log watcher.\n';
    }
}

//call a script from outside
function runScript(scriptPath, callback) {
    var childProcess = require('child_process');
    // keep track of whether callback has been invoked to prevent multiple invocations
    var invoked = false;
    var process = childProcess.fork(scriptPath);
    // listen for errors as they may prevent the exit event from firing
    process.on('error', function (err) {
        if (invoked) return;
        invoked = true;
        callback(err);
    });
    // execute the callback once the process has finished running
    process.on('exit', function (code) {
        if (invoked) return;
        invoked = true;
        var err = code === 0 ? null : new Error('exit code ' + code);
        callback(err);
    });
}

// A simple pid lookup 
function checkRunningProcess(){
  ps.lookup({
    command: 'node',
    psargs: 'ux'
    }, function(err, resultList ) {
    if (err) {
        throw new Error( err );
    }
    resultList.forEach(function( process ){
        if( process ){
            //console.log( 'PID: %s, COMMAND: %s, ARGUMENTS: %s', process.pid, process.command, process.arguments );
				if(process.arguments[0].trim()=='polling_sungrow_inverters.js'){
					script1running = true;
			    }
			    if(process.arguments[0].trim()=='polling_one_sungrow_inverter.js'){
					script2running = true;
			    }
			    if(process.arguments[0].trim()=='configuring_sungrow_inverters.js'){
					script3running = true;
			    }

			    if(process.arguments[0].trim()=='configuring_one_sungrow_inverter.js'){
					script4running = true;
			    }
        }
    });
  });
}
