const userCountURL = 'wss://streamevents.millicast.com/ws';
const recordSeparator = '\x1E';//parsing seperator for usercount msgs.

//User Count data
let receivedHandshakeResponse = false;//connection flag for user count.
let invocationId = 0;//unique id for usercount calls.
let ws_cnt;//User count websocket
let preFix = 'viewing: ';
let viewCount = preFix + '00';
let view; //optional DOM element to display count.

// User Count
function startUserCount(acct, name, viewTarget){
  if(!!ws_cnt || !acct || !name) return;
  view = viewTarget;
  
  const streamId = `${acct}/${name}`;//id for usercount.

  console.log('*cnt*  connect',userCountURL);
  ws_cnt = new WebSocket(userCountURL);
  ws_cnt.onerror = (evt) => {
    console.error('Websocket error',evt);
  };
  ws_cnt.onclose = (evt) => {
    console.trace(`Websocket closing. Code: ${evt.code} Reason: ${evt.reason}`);
  };
  
  ws_cnt.onmessage = (evt) => {
    if (!receivedHandshakeResponse) {
      console.trace('Received handshake response');
      receivedHandshakeResponse = true;
      handleHandshakeResponse(evt.data);

      console.log('Invoking method to watch view count');
      subscribeStreamCount(ws, streamId);
      return;
    }

    let response;
    try {
      response = parseSignalRMessage(evt.data);
    } catch (err) {
      console.error('Failed to parse JSON:', evt.data);
      throw err;
    }
    switch (response.type) {
      case 1:
        // invocation request
        if (response.target === 'SubscribeViewerCountResponse') {
          for (const { streamId, count } of response.arguments) {
            if (!streamId) {
              continue;
            }
            console.log(`Viewer count changed. ${streamId} = ${count}`);// view ${view}, preFix: ${preFix}
            if(!!view) view.innerHTML = preFix + (count.length > 1 ? count : '0'+count);
          }
        }
        break;
      case 3:
        // invocation response
        if (response.error) {
          console.error('Failed to invoke SubscribeViewerCount method', response.error);
          throw new Error(response.error);
        }
        for (const [ streamId, count] of Object.entries(response.result['streamIdCounts'])) {
          if (!streamId) {
            continue;
          }
          console.log(`Initial viewer count of ${streamId} = ${count}`);
        }
        break;
      case 6:
        // ping message, common ignore
        break;
    }
  };

  ws_cnt.onopen = (_evt) => {
    console.trace('Websocket opened, beginning handshake');
    const handshakeRequest = {
      protocol: "json",
      version: 1
    };
    sendSignalRMessage(ws, JSON.stringify(handshakeRequest));
  };

}

function subscribeStreamCount(ws, streamId) {
  const subscribeRequest = {
    arguments: [
      [ streamId ]
    ],
    // look for invocationId on response
    invocationId: (invocationId++).toString(),
    streamIds: [], // signalr streamIds, not millicast
    target: "SubscribeViewerCount",
    type: 1
  };
  sendSignalRMessage(ws, JSON.stringify(subscribeRequest));
}

function handleHandshakeResponse(messageStr) {
  const handshakeResponse = parseSignalRMessage(messageStr);
  if (handshakeResponse.error) {
    console.error(handshakeResponse.error);
    throw new Error(handshakeResponse.error);
  }
}


function parseSignalRMessage(messageStr) {
  if (messageStr.endsWith(recordSeparator)) {
    messageStr = messageStr.slice(0, -1);
  }
  return JSON.parse(messageStr);
}

function sendSignalRMessage(ws, messageStr) {
  if (!messageStr.endsWith(recordSeparator)) {
    messageStr += recordSeparator;
  }
  console.log('sendSignalRMessage ',messageStr);
  ws_cnt.send(messageStr);
}

function stopUserCount(){
  ws_cnt.close();
  ws_cnt = null;
}

console.log('User Count Loaded!!!')