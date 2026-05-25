const Redis = require('redis');

const publisher = Redis.createClient();
const subscriber = Redis.createClient();

publisher.connect();
subscriber.connect();

publisher.on('connect', () => {
  console.log('[Redis] Connected');
});

const publish = async (event, data) => {
  await publisher.publish(event, JSON.stringify(data));
};

const subscribe = async (event, handler) => {
  await subscriber.subscribe(event, (message) => {
    const data = JSON.parse(message);
    handler(data);
  });
};

module.exports = {
  publish,
  subscribe,
};
