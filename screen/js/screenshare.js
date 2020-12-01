const videoElem = document.getElementById("video");
//const videoTrack = videoElem.srcObject.getVideoTracks()[0];
const logElem = document.getElementById("log");
const startElem = document.getElementById("startSS");
const stopElem = document.getElementById("stopSS");

const apiPath = 'https://director.millicast.com/api/director/publish';
const turnUrl = 'https://turn.millicast.com/webrtc/_turn';
// Put variables in global scope to make them available to the browser console.

const audio = document.querySelector('audio');
const aconstraints = window.aconstraints = {
   audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 44100
  },
  video: false
};

function handleSuccess(astream) {
  const audioTracks = astream.getAudioTracks();
  console.log('Got stream with audio constraints:', aconstraints);
  console.log('Using audio device: ' + audioTracks[0].label);
  astream.oninactive = function() {
  console.log('Stream ended');
  };
  window.stream = astream; // make variable available to browser console
  audio.srcObject = astream;
  let audioStream = astream;
}

function handleError(error) {
  const errorMessage = 'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' + error.name;
  errorMsgElement.innerHTML = errorMessage;
  console.log(errorMessage);
}

navigator.mediaDevices.getUserMedia(aconstraints).then(handleSuccess).catch(handleError);
  //Millicast required info.
  let yourUrl = "https://robertdev.influxis.com/millicast/screen/player/?id=";
  let url;// path to Millicast Server - Returned from API
  let jwt;//authorization token - Returned from API

  // hard code it here, or enter it at runtime on the field.
  
   let params = new URLSearchParams(document.location.search.substring(1));
   let accountId = 'LZsuF8'; //let accountId ADD YOUR ACCOUNT ID HERE
   let streamName = params.get('id') + ""SS;
   let token ="35f9f7413eccf0a1c4cf1ee23b05289abbb4716b5833e5bdc2c0df012f2826fa";
   console.log('Millicast Viewer Stream: ', streamName);

  
  //media stream object from local user mic and camera.
  let stream;
  let voiceStream;
  let desktopStream;
  //peer connection - globalized.
  let pc;
  //web socket for handshake
  let ws;
  //Ice Servers:
  let iceServers = [];
  //form items and variables they are tied to.
  let views      = [
    {form: 'tokenTxt', param: 'token'},
    {form: 'streamTxt', param: 'streamName'},
    {form: 'viewTxt', param: 'accountId'}
  ];
  let isBroadcasting = false;
  function stopBroadcast() {
    console.log('stopBroadcast');
    if(!!pc){
      pc.close();
      //pc = null;
      console.log('close pc');
    }
    if (!!ws){
      ws.close();
      //ws = null;
      console.log('close ws');
    }
    setIsBroadcasting(false);
  }


  function startBroadcast() {
    if(isBroadcasting) {
      stopBroadcast();
      return;
    }
    //if missing params, assume the form has them.
    if (!token || !streamName || !accountId) {
      getFormParams();
    }
    // get a list of Xirsys ice servers.
    getICEServers()
      .then(list => {
        iceServers = list;
        //ready to connect.
        connect();
      })
      .catch(e => {
        alert('getICEServers Error: ', e);
        connect();//proceed with no (TURN)
      });
    
  }

  function connect() {
    let btn       = document.getElementById('publishBtn');
    btn.value = 'CONNECTING...';
    btn.disabled  = true;

    if (token && !url || token && !jwt) {
      console.log('connect to API - url:', url)
      updateMillicastAuth()
        .then(d => {
          console.log('auth info:', d);
          connect();
        })
        .catch(e => {
          console.log('API error: ', e);
          alert("Error: The API encountered an problem!", e);
        });
      return;
    }

    console.log('connecting to: ', url + '?token=' + jwt);//token
    //create Peer connection object, add TURN servers for fallback.
    console.log('iceservers: ', iceServers);
    pc = new RTCPeerConnection({iceServers: iceServers, bundlePolicy: "max-bundle"});
    //add media to connection

    stream.getTracks()
      .forEach(track => {
        console.log('audio track: ', track);
        pc.addTrack(track, stream)
      });

    //connect with Websockets for handshake to media server.
    ws    = new WebSocket(url + '?token=' + jwt);//token
    ws.onopen = function () {
      //Connect to our media server via WebRTC
      console.log('ws::onopen ', jwt);//token
      //create a WebRTC offer to send to the media server
      let offer = pc.createOffer({
       offerToReceiveAudio: true,
       offerToReceiveVideo: true
        }).then(desc => {
        console.log('createOffer Success!');
        //set local description and send offer to media server via ws.
        pc.setLocalDescription(desc)
          .then(() => {
            console.log('setLocalDescription Success !:', streamName);
            //set required information for media server.
            let data    = {
              name:  streamName,
              sdp:   desc.sdp,
              codec: 'h264'
            }
            //create payload
            let payload = {
              type:    "cmd",
              transId: Math.random() * 10000,
              name:    'publish',
              data:    data
            }
            ws.send(JSON.stringify(payload));
          })
          .catch(e => {
            console.log('setLocalDescription failed: ', e);
          })
      }).catch(e => {
        console.log('createOffer Failed: ', e)
      });
    }

    ws.addEventListener('message', evt => {
      console.log('ws::message', evt);
      let msg = JSON.parse(evt.data);
      switch (msg.type) {
        //Handle counter response coming from the Media Server.
        case "response":
          let data   = msg.data;
          let answer = new RTCSessionDescription({
                           type: 'answer',
                          sdp:  data.sdp + "a=x-google-flag:conference\r\n",
                           sdp: data.sdp + "a=MID:video\r\nb=AS:" + 2000 +"\r\n"
                                                 });

          pc.setRemoteDescription(answer)
            .then(d => {
              console.log('setRemoteDescription Success! ');
              isBroadcasting = true;
              showViewURL();
              setIsBroadcasting(true);
            })
            .catch(e => {
              console.log('setRemoteDescription failed: ', e);
              setIsBroadcasting(false);
            });
          break;
      }
    })
  }
  /* Update visual elelments */
  function setIsBroadcasting(b){
    isBroadcasting = b;
    let btn       = document.getElementById('publishBtn');
    btn.value = isBroadcasting ? 'STOP LIVE' : 'START PUBLISH';
    btn.disabled  = false;
   if (btn.value == 'STOP LIVE'){
    btn.style.backgroundColor = "red"; 
    }else{
     btn.style.backgroundColor = "green";   
    }
    btn.disabled  = false;
    }
 
  // Gets ice servers.
  function getICEServers() {
    return new Promise((resolve, reject) => {
      let xhr                = new XMLHttpRequest();
      xhr.onreadystatechange = function (evt) {
  
        
        if (xhr.readyState !== 4) {
            return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
            let error = new Error(`IceServers call failed. StatusCode: ${xhr.status} Response: ${xhr.responseText}`);
            error.responseStatus = xhr.status;
            error.responseText = xhr.responseText;
            error.responseJson = null;
            reject(error);
            return;
        }

        let jsonResponse = JSON.parse(xhr.responseText);
        if (!jsonResponse || jsonResponse['s'] !== 'ok') {
            let error = new Error(`IceServers invalid response. Response: ${xhr.responseText}`);
            error.responseStatus = xhr.status;
            error.responseText = xhr.responseText;
            error.responseJson = jsonResponse;
            reject(error);
            return;
        }

        // final resolve array
        let finalServers = [];

        let credentials = [];
        let valIceServers = jsonResponse['v']['iceServers'] ? jsonResponse['v']['iceServers'] : jsonResponse['v'] ? jsonResponse['v'] : [];
        console.log('valIceServers', valIceServers, jsonResponse);
        for (const server of valIceServers) {
            // normalize server.urls
            if (server.url) {
                // convert to new url's format if detected
                server.urls = [server.url];
                delete server.url;
            } else if (server.urls && !Array.isArray(server.urls)) {
                // assuming this is using legacy notation where urls is a single string
                server.urls = [server.urls];
            } else {
                // assure we have an array of something
                server.urls = [];
            }

            // skip empty urls
            if (!server.urls.length) {
                continue;
            }
            // now to identify servers with identical credentials

            // not everything has credentials
            if (!server.username || !server.credential) {
                finalServers.push(server);
                continue;
            }

            let credIndex = credentials.findIndex((s) => s.username === server.username && s.credential === server.credential);
            if (credIndex === -1) {
                // new credential pair
                credentials.push(server);
                continue;
            }

            // else we want to merge with credIndex
            let mergeServer = credentials[credIndex];
            for (const urlStr of server.urls) {
                mergeServer.urls.push(urlStr);
            }
        }

        // lets separate udp from tcp and unspecified
        for (const server of credentials) {
            let udpUrls = [];
            let tcpUrls = [];
            let unspecifiedUrls = [];

            for (const urlStr of server.urls) {
                let queryIndex = urlStr.indexOf('?');
                if (queryIndex === -1) {
                    unspecifiedUrls.push(urlStr);
                    continue;
                }

                let queryString = new URLSearchParams(urlStr.substr(queryIndex + 1));
                let transport = queryString.get('transport');
                switch (transport) {
                    case 'udp':
                        udpUrls.push(urlStr);
                        break;
                    case 'tcp':
                        tcpUrls.push(urlStr);
                        break;
                    default:
                        unspecifiedUrls.push(urlStr);
                        break;
                }
            }

            if (udpUrls.length) {
                let newServer = Object.assign({}, server);
                newServer.urls = udpUrls;
                finalServers.push(newServer);
            }
            if (tcpUrls.length) {
                let newServer = Object.assign({}, server);
                newServer.urls = tcpUrls;
                finalServers.push(newServer);
            }
            if (unspecifiedUrls.length) {
                let newServer = Object.assign({}, server);
                newServer.urls = unspecifiedUrls;
                finalServers.push(newServer);
            }
            
        }

        resolve(finalServers);
      }
      xhr.open("PUT", turnUrl, true);
      xhr.send();
    })
  }



function displayMediaOptions() {
    return new Promise((resolve, reject) => {
      let constraints = {
          audio: true,
          video: {
          cursor: "always"
           
        }
      }
//

startElem.addEventListener("click", function(evt) {
  startCapture();
}, false);

 stopElem.addEventListener("click", function(evt) {
  stopCapture();
}, false);

async function startCapture() {
logElem.innerHTML = "";
window.location.reload();
try {
   // videoElem.srcObject = await navigator.mediaDevices.getDisplayMedia(constraints);
    dumpOptionsInfo();
  } catch(err) {
    console.error("Error: " + err);
  }
}
//start capture

function stopCapture(evt) {
  let tracks = videoElem.srcObject.getTracks(constraints);

  tracks.forEach(track => track.stop());
  videoElem.srcObject = null;
}

//for logging screen capture
function dumpOptionsInfo() {
  const videoTrack = videoElem.srcObject.getVideoTracks()[0];
 
  console.info("Track settings:");
  console.info(JSON.stringify(videoTrack.getSettings(), null, 2));
  console.info("Track constraints:");
  console.info(JSON.stringify(videoTrack.getConstraints(), null, 2));
}
//audio and screen need to be merged

 //end
    navigator.mediaDevices.getUserMedia(constraints)
     //Need Switch for switching Media types
      navigator.mediaDevices.getDisplayMedia(constraints)
      //navigator.mediaDevices.getUserMedia(constraints)
        .then(str => {
          resolve(str);
        }).catch(err => {
        console.error('Could not get Media: ', err);
        reject(err);
      })
    });
  }


  // gets server path and auth token.
  function updateMillicastAuth() {
    console.log('updateMillicastAuth for:', streamName);
    return new Promise((resolve, reject) => {
      let xhr                = new XMLHttpRequest();
      xhr.onreadystatechange = function (evt) {
        if (xhr.readyState == 4) {
          let res = JSON.parse(xhr.responseText);
          console.log('res: ', res);
          console.log('status:', xhr.status, ' response: ', xhr.responseText);
          switch (xhr.status) {
            case 200:
              let d = res.data;
              jwt   = d.jwt;
              url   = d.urls[0];
              resolve(d);
              break;
            default:
              reject(res);
          }
        }
      }
      xhr.open("POST", apiPath, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify({streamName: streamName}));
    });
  }

  // Display the path to the viewer and passes our id to it.
  function showViewURL() {
    //if no viewer stream id is provided, path to viewer not shown.
    if (!!accountId) {
      let vTxt = document.getElementById('viewerUrl');
      let href = (location.href).split('?')[0];
      console.log('href:', href, ', indexOF ', href.indexOf('htm'), 'lastindex /', href.lastIndexOf('/'));
      if (href.indexOf('htm') > -1) {
        href = href.substring(0, href.lastIndexOf('/') + 1);
      }
      let url  = yourUrl + streamName;
      vTxt.innerText = 'Viewer Path:\n' + url;
      vTxt.setAttribute('href', url);
    }

    //disable publish button.
    /* let btn       = document.getElementById('publishBtn');
    btn.innerHTML = 'BROADCASTING LIVE';
    btn.disabled  = true; */

    //hide form
    document.getElementById('form').setAttribute("style", "display: none;");
  }

  //sets required data to broadcast and view.
  function setParams() {
    //get millicast id from url if undefined in variable above. otherwise use show a form at runtime.
    let params = new URLSearchParams(document.location.search.substring(1));
    if (!token) {//if we have token, bypass this.
      token = params.get('token');//if no token, try url params.
    }
    if (!streamName) {
      streamName = params.get('streamName');
    }
    if (!accountId) {
      accountId = params.get('accountId');
    }

    console.log('setParams - token:', token, ' name: ', streamName, ', viewer ID:', accountId, ', mc url:', url, ', TURN url', turnUrl);
    //if still missing token in the URLS for any of them, show form.
    if (!token || !streamName || !accountId) {
      document.getElementById('form').setAttribute("style", "display: unset;");
      let i, l = views.length;
      for (i = 0; i < l; i++) {
        let item = views[i];
        let txt  = document.getElementById(item.form);
        console.log('item ', item, ' txt:', txt);
        switch (item.param) {
          case 'token':
            txt.value = !!token ? token : '';
            break;
          case 'streamName':
            txt.value = !!streamName ? streamName : '';
            break;
          case 'accountId':
            txt.value = !!accountId ? accountId : '';
            break;
        }
      }
    }
    if (token) {// && !!url
      updateMillicastAuth()
        .then(d => {
          console.log('millicast auth data:', d);
        })
        .catch(e => {
          console.log('api error: ', e);
        })
    }
  }

  function getFormParams() {
    let i, l = views.length;
    for (i = 0; i < l; i++) {
      let item = views[i];
      let txt  = document.getElementById(item.form).value;
      console.log('item ', item, ' txt:', txt);
      switch (item.param) {
        case 'token':
          token = txt;
          break;
        case 'streamName':
          streamName = txt;
          break;
        case 'accountId':
          accountId = txt;
          break;
      }
    }
    console.log('getFormParams - token:', token, ', streamName:', streamName, ', accountId:', accountId);
  }

 async function toggleMic() {
    let b = !stream.getAudioTracks()[0].enabled;
    stream.getAudioTracks()[0].enabled = b;
    let micMuted = !b;
    console.log('toggleMic muted:', micMuted);
    //micOffIcon
    let btn = document.getElementById('micMuteBtn');
    btn.value = micMuted ? 'UNMUTE MIC' : 'MUTE MIC';
    if (btn.value == 'UNMUTE MIC'){
    btn.style.backgroundColor = "red"; 
    }else{
     btn.style.backgroundColor = "green";   
    }
  }

  //START

  function ready() {
    console.log('Millicast token: ', token);
    //sets required data to broadcast and view.
    setParams();

    //Setup publish button
    let pubBtn = document.getElementById('publishBtn');
    if (pubBtn) {
      pubBtn.onclick = evt => {
        startBroadcast();
      };
    }

    //Get users camera and mic
     displayMediaOptions()
      .then(str => {
        stream = str;
        //set cam feed to video window so user can see self.
        let videoElem = document.getElementsByTagName('video')[0];
        if (videoElem) {
          videoElem.srcObject = stream;
        }
      })
      .catch(e => {
        alert('getUserMedia Error Yo: ', e);
      });
  }

  if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
    ready();
  } else {
    document.addEventListener('DOMContentLoaded', ready);
  }

