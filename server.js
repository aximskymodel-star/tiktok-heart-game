const express = require('express');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'your_tiktok_username';

let tiktokConnection = null;
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Game client connected. Total:', clients.size);
  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to server!' }));
  ws.on('close', () => { clients.delete(ws); });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

const GIFT_MAP = {
  'Rose':      { type: 'rose',  coins: 1  },
  'TikTok':    { type: 'rose',  coins: 1  },
  'Heart Me':  { type: 'rose',  coins: 1  },
  'Ice Cream': { type: 'star',  coins: 5  },
  'Finger Heart': { type: 'star', coins: 5 },
  'Crown':     { type: 'storm', coins: 20 },
  'Drama Queen': { type: 'storm', coins: 20 },
  'Angel':     { type: 'angel', coins: 50 },
  'Universe':  { type: 'angel', coins: 100 },
  'Lion':      { type: 'angel', coins: 500 },
};

function connectToTikTok() {
  console.log(`Connecting to TikTok: @${TIKTOK_USERNAME}`);
  tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

  tiktokConnection.connect().then(() => {
    console.log('Connected to TikTok Live!');
    broadcast({ type: 'tiktok_connected', username: TIKTOK_USERNAME });
  }).catch(err => {
    console.error('TikTok connection error:', err.message);
    broadcast({ type: 'tiktok_error', message: err.message });
    setTimeout(connectToTikTok, 10000);
  });

  tiktokConnection.on('gift', (data) => {
    const giftName = data.giftName || '';
    const mapped = GIFT_MAP[giftName];
    const giftType = mapped ? mapped.type : 'rose';
    broadcast({
      type: 'gift',
      giftType,
      giftName,
      username: data.uniqueId || 'someone',
      coins: data.diamondCount || 0,
      repeatCount: data.repeatCount || 1,
    });
    console.log(`Gift: ${giftName} from @${data.uniqueId}`);
  });

  tiktokConnection.on('chat', (data) => {
    broadcast({
      type: 'chat',
      username: data.uniqueId,
      message: data.comment,
    });
  });

  tiktokConnection.on('like', (data) => {
    broadcast({ type: 'like', username: data.uniqueId, count: data.likeCount });
  });

  tiktokConnection.on('disconnected', () => {
    console.log('TikTok disconnected. Reconnecting...');
    setTimeout(connectToTikTok, 5000);
  });
}

connectToTikTok();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
