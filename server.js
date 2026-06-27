const express = require('express');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'your_username';

let tiktokConnection = null;
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected' }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

const GIFT_MAP = {
  'Rose': 'rose', 'TikTok': 'rose', 'Heart Me': 'rose', 'Sending Love': 'rose',
  'Ice Cream': 'star', 'Finger Heart': 'star', 'Perfume': 'star', 'GG': 'star',
  'Crown': 'storm', 'Drama Queen': 'storm', 'Thunder': 'storm',
  'Angel': 'angel', 'Universe': 'angel', 'Lion': 'angel', 'Rocket': 'angel',
};

function getGiftType(name, coins) {
  if (GIFT_MAP[name]) return GIFT_MAP[name];
  if (coins >= 500) return 'angel';
  if (coins >= 50) return 'storm';
  if (coins >= 10) return 'star';
  return 'rose';
}

function connectToTikTok() {
  console.log(`Connecting to @${TIKTOK_USERNAME}...`);

  tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME, {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
    clientParams: {
      app_language: 'en-US',
      device_platform: 'web',
    }
  });

  tiktokConnection.connect()
    .then(() => {
      console.log('Connected to TikTok Live!');
      broadcast({ type: 'tiktok_connected', username: TIKTOK_USERNAME });
    })
    .catch(err => {
      console.error('TikTok error:', err.message);
      broadcast({ type: 'tiktok_error', message: 'Not live yet — waiting...' });
      setTimeout(connectToTikTok, 30000);
    });

  tiktokConnection.on('gift', (data) => {
    if (data.giftType === 1 && !data.repeatEnd) return;
    const giftType = getGiftType(data.giftName, data.diamondCount);
    broadcast({
      type: 'gift',
      giftType,
      giftName: data.giftName || 'Gift',
      username: data.uniqueId || 'someone',
      coins: data.diamondCount || 0,
      repeatCount: data.repeatCount || 1,
    });
    console.log(`Gift: ${data.giftName} x${data.repeatCount} from @${data.uniqueId}`);
  });

  tiktokConnection.on('chat', (data) => {
    broadcast({ type: 'chat', username: data.uniqueId, message: data.comment });
  });

  tiktokConnection.on('like', (data) => {
    broadcast({ type: 'like', username: data.uniqueId, count: data.likeCount });
  });

  tiktokConnection.on('disconnected', () => {
    console.log('Disconnected. Reconnecting in 10s...');
    broadcast({ type: 'tiktok_error', message: 'Reconnecting...' });
    setTimeout(connectToTikTok, 10000);
  });

  tiktokConnection.on('error', (err) => {
    console.error('Connection error:', err);
  });
}

connectToTikTok();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
