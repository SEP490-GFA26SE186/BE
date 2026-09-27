import IORedis from 'ioredis';
import env from '../config/env.js';

// BullMQ yeu cau maxRetriesPerRequest = null: mac dinh ioredis se throw sau N
// lan thu lai, lam Worker chet han khi Redis chi mat ket noi tam thoi.
const connection = new IORedis(env.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

connection.on('error', (error) => {
  console.error(`[redis] ${error.message}`);
});

export default connection;
