///URL to millicast API

  const videoElem = document.getElementById("video");

  const apiPath = 'https://director.millicast.com/api/director/publish';
  const turnUrl = 'https://turn.millicast.com/webrtc/_turn';
  const startElem = document.getElementById("startSS");
  const stopElem = document.getElementById("stopSS");



  //Millicast required info.
  let url;// path to Millicast Server - Returned from API
  let jwt;//authorization token - Returned from API

  // (Millicast API Info) hard code it here, or enter it at runtime on the field.
  let params = new URLSearchParams(document.location.search.substring(1));
  let token = params.get('tn');
  let streamName = params.get('id') + "SS";
  let accountId = params.get('at');
  let player1 = "https://rnkvogel.github.io/Millicast2020/player/?accountId=" + accountId + "&streamName=" + streamName ;   
  let player2 = "https://rnkvogel.github.io/Millicast2020//player/?accountId=" + accountId + "&streamName=" + streamName + "SS";
  let videoBitrate = 2500;

  
function stopScreen() {
  //screenshare
    window.open(stream2 , "_parent"); 
    //document.write("<script src='screen/js/publisher.js'><\/script>") 
    document.getElementById('screenshare').src = player2;
    document.getElementById('localVideo').src = player1;
    if (isBroadcasting == true){
    document.getElementById('localVideo').src = player2;
    }
  }


  const codec = 'h264'; //'vp8', 'vp9'
  const stereo = true;//true for stereo
  const useSimulcast = false;//true for simulcast. (chrome only)
  
  let pc;//peer connection
  let ws;//live websocket
  let isBroadcasting = false;

  // You can add them to the url as a prameter
  // ex:( /publisher.html?token=8e16b5fff53e3&streamName=feed1&accountId=L7c3p0 ).
  //media stream object from local user mic and camera.
  let stream;
  //Ice Servers:
  let iceServers = [];
  //form items and variables they are tied to.
  let views      = [
    {form: 'tokenTxt', param: 'token'},
    {form: 'streamTxt', param: 'streamName'},
    {form: 'viewTxt', param: 'accountId'}
  ];
//Start Screen Share


function stopCapture(evt) {
  let tracks = videoElem.srcObject.getTracks();
  tracks.forEach(track => track.stop());
  videoElem.srcObject = null;
}
//start stop publishing
  function startBroadcast() {
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
        alert('Error: ', e);
        connect();//proceed with no (TURN)
      });
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
        alert('Error: ', e);
        connect();//proceed with no (TURN)
    });

}
  //Stop Start

  function stopBroadcast(){
    window.close();
    console.log('Stop Broadcasting');
 
     ws.onclose = () => {
    console.log(ws + 'Web Socket Connection Closed');
   };
   
    pc.close();
    pc = null;
    ws.close();
    ws = null;
    jwt = null;
    
    isBroadcasting = false;
    onBroadcasting();
  }

//Mic on off
  function toggleMic() {
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
 

  function connect() {

    return new Promise( (resolve, reject) => {
      if (token && !url || token && !jwt) {
        console.log('connect to API - url:', url)
        return updateMillicastAuth()
          .then(d => {
            console.log('auth info:', d);
            connect();
          })
          .catch(e => {
            console.log('API error: ', e);
            alert("Error: The API encountered an problem!", e);
            reject("Error: The API encountered an problem !", e);
          });
      }

      console.log('connecting to: ', url + '?token=' + jwt);//token
      //create Peer connection object, add TURN servers for fallback.
      console.log('iceservers: ', iceServers);
      pc = new RTCPeerConnection({iceServers: iceServers, bundlePolicy: "max-bundle"});
      //add media to connection
      if(!stream) {
        reject('Error: Media was not detected!');
        alert('Error: Media was not detected!');
        return;
      }
      stream.getTracks()
        .forEach(track => {
          console.log('audio track: ', track);
          pc.addTrack(track, stream)
        });

      //connect with Websockets for handshake to media server.
      ws = new WebSocket(url + '?token=' + jwt);//token
      ws.onopen = function () {
        //Connect to our media server via WebRTC
        console.log('ws::onopen ', jwt);//token
        //create a WebRTC offer to send to the media server
        let offer = pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
          .then(desc => {
            console.log('createOffer Success!');

            //support for stereo
            desc.sdp = desc.sdp.replace("useinbandfec=1", "useinbandfec=1; stereo=1");

            //optional support for simulcast
            if(useSimulcast == true && codec != 'vp9'){
              desc.sdp = setSimulcast(desc);
              console.log('simulcast SDP:',desc.sdp);
            }

            //set local description and send offer to media server via ws.
            pc.setLocalDescription(desc)
              .then(() => {
                console.log('setLocalDescription Success !:', streamName);
                //set required information for media server.
                let data = {
                  name:  streamName,
                  sdp:   desc.sdp ,
                  codec: codec//'h264'

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
          ws.onclose = function (){
          setTimeout(function(){
          //location.reload();
          //track.close();
          }, 10000);
          console.log('ws::closed ');//token
          }
      }

      ws.addEventListener('message', evt => {
        console.log('ws::message', evt);

        let msg = JSON.parse(evt.data);
        switch (msg.type) {
          //Handle counter response coming from the Media Server.
          case "response":
            let data   = msg.data;
            let remotesdp = data.sdp;


            /* handle older versions of Safari */
            if (remotesdp && remotesdp.indexOf('\na=extmap-allow-mixed') !== -1) {
              remotesdp = remotesdp.split('\n').filter(function (line) {
                return line.trim() !== 'a=extmap-allow-mixed';
              }).join('\n');
              console.log('trimed a=extmap-allow-mixed - sdp \n',remotesdp);
            }

            let answer = new RTCSessionDescription(
              { type: 'answer',
                sdp:  remotesdp + "a=x-google-flag:conference\r\n",
                sdp: data.sdp + "a=MID:video\r\nb=AS:" + videoBitrate +"\r\n"

              }
            );

            pc.setRemoteDescription(answer)
              //brodcast begin
              .then(d => {
                console.log('setRemoteDescription Success! ');
                isBroadcasting = true;
                showViewURL();
                onBroadcasting();

                //hide form
                document.getElementById('form').setAttribute("style", "display: none;");
              })
              .catch(e => {
                console.log('setRemoteDescription failed: ', e);
              });
            break;
        }
      })

      resolve(pc);
    });
  }
//Start SCreen Share
  function screenStart(){
    let btn = document.getElementById('screenSource');
  // alert("hello");

}

//Start stop

  function onBroadcasting(){
    let btn = document.getElementById('publishBtn');
    console.log('broadcasting:', isBroadcasting);
    btn.innerHTML = isBroadcasting ? 'STOP SHARING' : 'START SHARING';
    if (btn.value ='STOP SHARING'){
    btn.style.backgroundColor = "red"; 
    }  
    if(isBroadcasting == false){
    btn.style.backgroundColor = "green"; 
    btn.value = 'START SHARING';

    }
     if(isBroadcasting) {
      // send accountId, streamname, and reference to count display.
      startUserCount(accountId, streamName, document.getElementById('count'));
    } else {
      // stopUserCount();
    }

}
  
  function setSimulcast(offer) {
    //support for multiopus
    ///// temporary patch for now
    let isChromium = window.chrome;
    let winNav = window.navigator;
    let vendorName = winNav.vendor;
    let agent = winNav.userAgent.toLowerCase();
    let isOpera = typeof window.opr !== "undefined";
    let isIEedge = agent.indexOf("edge") > -1;
    // let isEdgium = agent.indexOf("edg") > -1;
    let isIOSChrome = agent.match("crios");

    let isChrome = false;
    if (isIOSChrome) {
    } else if( isChromium !== null && typeof isChromium !== "undefined" &&
                vendorName === "Google Inc." && isOpera === false &&
                isIEedge === false) {/*  && isEdgium === false */
      // is Google Chrome
      isChrome = true;
    }
try {
      if(isChrome){
        //Get sdp
        let sdp = offer.sdp;
        //OK, chrome way  +  "a=MID:video\r\nb=AS:" + 2000 +"\r\n",
        const reg1 = RegExp("m=video.*\?a=ssrc:(\\d*) cname:(.+?)\\r\\n","s");
     
        const reg2 = RegExp("m=video.*\?a=ssrc:(\\d*) mslabel:(.+?)\\r\\n","s");
    
        const reg3 = RegExp("m=video.*\?a=ssrc:(\\d*) msid:(.+?)\\r\\n","s");

        const reg4 = RegExp("m=video.*\?a=ssrc:(\\d*) label:(.+?)\\r\\n","s");
  
        //Get ssrc and cname
        let res = reg1.exec(sdp);
        const ssrc = res[1];
        const cname = res[2];
        //Get other params
        const mslabel = reg2.exec(sdp)[2];
        const msid = reg3.exec(sdp)[2];
        const label = reg4.exec(sdp)[2];
        //Add simulcasts ssrcs
        const num = 2;
        const ssrcs = [ssrc];
        for (let i=0;i<num;++i) {
          //Create new ssrcs
          const ssrc = 100+i*2;
          const rtx   = ssrc+1;
          //Add to ssrc list
          ssrcs.push(ssrc);
          //Add sdp stuff  
          sdp +=  "a=ssrc-group:FID " + ssrc + " " + rtx + "\r\n" +
            "a=ssrc:" + ssrc + " cname:" + cname + "\r\n" +
            "a=ssrc:" + ssrc + " msid:" + msid + "\r\n" +
            "a=ssrc:" + ssrc + " mslabel:" + mslabel + "\r\n" +
            "a=ssrc:" + ssrc + " label:" + label + "\r\n" +
            "a=ssrc:" + rtx + " cname:" + cname + "\r\n" +
            "a=ssrc:" + rtx + " msid:" + msid + "\r\n" +
            "a=ssrc:" + rtx + " mslabel:" + mslabel + "\r\n" +
            "a=ssrc:" + rtx + " label:" + label + "\r\n";
            //"a=ssrc:" + "video\r\nb=AS:" + 3000 +"\r\n";
        }
        //Conference flag
        sdp += "a=x-google-flag:conference\r\n";
        //Add SIM group
        sdp += "a=ssrc-group:SIM " + ssrcs.join(" ") + "\r\n";
        //Update sdp in offer without the rid stuff
        //sdp: data.sdp + "a=MID:video\r\nb=AS:" + 3000 +"\r\n";
        offer.sdp = sdp;
        //Add RID equivalent to send it to the sfu
        sdp += "a=simulcast:send a;b;c\r\n";
        sdp += "a=rid:c send ssrc="+ssrcs[0]+"\r\n";
        sdp += "a=rid:b send ssrc="+ssrcs[1]+"\r\n";
        sdp += "a=rid:a send ssrc="+ssrcs[2]+"\r\n";
        //Set it back
        // offer.sdp = sdp;
        console.log('* simulcast set!');
      }
    } catch(e) {
      console.error(e);
      console.log(ssrcs);
    }
    
    return offer.sdp;
  }

  // Gets ice servers.
  function getICEServers() {
    return new Promise((resolve, reject) => {
      let xhr= new XMLHttpRequest();
      xhr.onreadystatechange = function (evt) {
        if (xhr.readyState == 4) {
          let res = JSON.parse(xhr.responseText), a;
          console.log('getICEServers::status:', xhr.status, ' response: ', xhr.responseText);
          switch (xhr.status) {
            case 200:
              //returns array.
              if (res.s !== 'ok') {
                a = [];
                //failed to get ice servers, resolve anyway to connect w/ out.
                resolve(a);
                return
              }
              let list = res.v.iceServers;
              a        = [];
              //call returns old format, this updates URL to URLS in credentials path.
              list.forEach(cred => {
                let v = cred.url;
                //console.log('cred:',cred);
                if (!!v) {
                  cred.urls = v;
                  delete cred.url;
                }
                a.push(cred);
              });
              //console.log('ice: ',a);
              resolve(a);
              break;
              default:
              a = [];
              //failed to get ice servers, resolve anyway to connect w/ out.
              resolve(a);
              break;
          }
        }
      }
      xhr.open("PUT", turnUrl, true);
      xhr.send();
    })
  }

function getMedia() {
const screenW = screen.width;
const screenH = screen.hight  
let isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
//let isEdge = /Edge/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
let constraints =  { 
    video: {
    mediaSource: "screen",
    width: screenW ,
    height: screenH,
    frameRate:60,  

  },
  audio: false
};  
let screenMedia = navigator.mediaDevices.getUserMedia(constraints);

if (isChrome) { 
screenMedia =  navigator.mediaDevices.getDisplayMedia(constraints);
} 

return new Promise((resolve, reject) => {
 //getmedia constraints needs to chec
 
 screenMedia
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
              if( res.status !== 'fail' ){
                let d = res.data;
                jwt   = d.jwt;
                url   = d.urls[0];
                resolve(d);
              }
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
      let url        = player2;
      vTxt.innerText = 'Viewer Path:\n' + url;
      vTxt.setAttribute('href', url);
    }

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
    } else {
      showViewURL();
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

  //START

  function ready() {
    console.log('Millicast token: ', token);
    //sets required data to broadcast and view.
    setParams();

    //Setup publish button
    let pubBtn = document.getElementById('publishBtn');
    if (pubBtn) {
      pubBtn.onclick = evt => {
        if(isBroadcasting == false){
          startBroadcast();
        } else {
          stopBroadcast();
        }
      };
    }

//Get users camera and mic

//Get Screen
    getMedia()
      .then(str => {
        stream     = str;
        //set cam feed to video window so user can see self.
        let vidWin = document.getElementsByTagName('video')[0];
        if (vidWin) {
          vidWin.srcObject = stream;
          connect();
        }
      })
      .catch(e => {
        alert('getUserMedia Error: ', e);
      });
  }
if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading") {
    ready();
  } else {
    document.addEventListener('DOMContentLoaded', ready);
  }


