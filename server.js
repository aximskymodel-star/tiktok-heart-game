const express = require('express');
const { WebSocketServer } = require('ws');
const { EulerStream } = require('eulerstream');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'your_username';
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

function getGiftType(name, coins) {
  const map = {
    'Rose': 'rose', 'TikTok': 'rose', 'Heart Me': 'rose', 'Sending Love': 'rose', 'Finger Heart': 'rose',
    'Ice Cream': 'star', 'Perfume': 'star', 'GG': 'star', 'Sunglasses': 'star',
    'Crown': 'storm', 'Drama Queen': 'storm', 'Thunder': 'storm',
    'Angel': 'angel', 'Universe': 'angel', 'Lion': 'angel', 'Rocket': 'angel',
  };
  if (map[name]) return map[name];
  if (coins >= 500) return 'angel';
  if (coins >= 50) return 'storm';
  if (coins >= 10) return 'star';
  return 'rose';
}

async function connectToTikTok() {
  console.log(`Connecting to @${TIKTOK_USERNAME}...`);
  try {
    const stream = new EulerStream(TIKTOK_USERNAME);

    stream.on('gift', (data) => {
      const giftType = getGiftType(data.gift?.name, data.gift?.diamond_count || 0);
      broadcast({
        type: 'gift',
        giftType,
        giftName: data.gift?.name || 'Gift',
        username: data.user?.unique_id || 'someone',
        coins: data.gift?.diamond_count || 0,
        repeatCount: data.gift?.repeat_count || 1,
      });
      console.log(`Gift: ${data.gift?.name} from @${data.user?.unique_id}`);
    });

    stream.on('chat', (data) => {
      broadcast({ type: 'chat', username: data.user?.unique_id, message: data.comment });
    });

    stream.on('like', (data) => {
      broadcast({ type: 'like', username: data.user?.unique_id });
    });

    stream.on('connected', () => {
      console.log('Connected to TikTok Live!');
      broadcast({ type: 'tiktok_connected', username: TIKTOK_USERNAME });
    });

    stream.on('disconnected', () => {
      console.log('Disconnected. Reconnecting in 15s...');
      broadcast({ type: 'tiktok_error', message: 'Reconnecting...' });
      setTimeout(connectToTikTok, 15000);
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err.message);
      broadcast({ type: 'tiktok_error', message: 'Not live yet — waiting...' });
      setTimeout(connectToTikTok, 30000);
    });

    await stream.connect();
  } catch (err) {
    console.error('Connect error:', err.message);
    broadcast({ type: 'tiktok_error', message: 'Not live yet — waiting...' });
    setTimeout(connectToTikTok, 30000);
  }
}

connectToTikTok();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
