const Redis = require('ioredis');

const pub = new Redis({
  host: '127.0.0.1',
  port: 6379
});

const sub = new Redis({
  host: '127.0.0.1',
  port: 6379
});

pub.on('connect', () => {
  console.log('[Redis] Publisher connected');
});

sub.on('connect', () => {
  console.log('[Redis] Subscriber connected');
});

sub.on('error', (err) => {
  console.error('[Redis] Subscriber error:', err);
});

pub.on('error', (err) => {
  console.error('[Redis] Publisher error:', err);
});

// 🔥 CRITICAL FIX: message listener
sub.on('message', (channel, message) => {
  console.log(`[Bus] Message received on ${channel}:`, message);

  if (handlers[channel]) {
    try {
      handlers[channel](JSON.parse(message));
    } catch (err) {
      console.error('[Bus] Error handling message:', err);
    }
  }
});

const handlers = {};

// 🔥 subscribe
const subscribe = (channel, handler) => {
  console.log(`[Bus] Subscribing to ${channel}`);
  handlers[channel] = handler;
  sub.subscribe(channel);
};

// 🔥 publish
const publish = async (channel, message) => {
  console.log(`[Bus] Publishing to ${channel}:`, message);
  await pub.publish(channel, JSON.stringify(message));
};

module.exports = {
  subscribe,
  publish
};
