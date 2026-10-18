import dotenv from 'dotenv';
dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  },
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  ai: {
    // URL noi bo cua ai/. CHI worker duoc dat bien nay — container
    // `api` khong nhan no, de moi request AI buoc phai di qua queue.
    serviceUrl: process.env.AI_SERVICE_URL,
    internalToken: process.env.INTERNAL_TOKEN,
    // Ghi de timeout theo job; khong dat thi aiClient.js dung mac dinh trong
    // JOB_CONFIG (undefined).
    timeoutMsByJob: {
      story_text: parseInt(process.env.AI_TIMEOUT_MS_STORY_TEXT, 10) || undefined,
      character_portrait: parseInt(process.env.AI_TIMEOUT_MS_CHARACTER_PORTRAIT, 10) || undefined,
      scene_image: parseInt(process.env.AI_TIMEOUT_MS_SCENE_IMAGE, 10) || undefined,
      narration: parseInt(process.env.AI_TIMEOUT_MS_NARRATION, 10) || undefined,
    },
    attempts: parseInt(process.env.AI_JOB_ATTEMPTS, 10) || 3,
    concurrency: parseInt(process.env.AI_WORKER_CONCURRENCY, 10) || 3,
  },
  // Ky link xem anh / audio cho client (src/clients/assetUrl.js). Phai cung tai khoan + folder voi ai/.
  // CHI container api can (worker khong tra link cho ai).
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'storyweaver',
  },
  // payOS: chi container api can (worker khong goi payOS). Xem src/clients/payos.js.
  payos: {
    clientId: process.env.PAYOS_CLIENT_ID,
    apiKey: process.env.PAYOS_API_KEY,
    checksumKey: process.env.PAYOS_CHECKSUM_KEY,
    payout: {
      clientId: process.env.PAYOS_PAYOUT_CLIENT_ID || undefined,
      apiKey: process.env.PAYOS_PAYOUT_API_KEY || undefined,
      checksumKey: process.env.PAYOS_PAYOUT_CHECKSUM_KEY || undefined,
    },
  },
  // Trang Web ma payOS tra nguoi dung ve sau khi thanh toan / huy (returnUrl, cancelUrl).
  webUrl: (process.env.WEB_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  brevo: {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL || 'no-reply@storyweaver.ai',
    senderName: process.env.BREVO_SENDER_NAME || 'StoryWeaver AI',
  },
  email: {
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    from: process.env.EMAIL_FROM || 'StoryWeaver AI <no-reply@storyweaver.ai>',
  },
};

/**
 * Kiem tra cac bien moi truong bat buoc.
 *
 * Moi entrypoint tu khai bao bien no can, thay vi validate tap trung: container
 * `api` va container `worker` dung chung image nhung duoc cap env KHAC nhau
 * (xem bang trong README). Neu validate tap trung thi worker se crash vi thieu
 * JWT_SECRET — bien ma no khong duoc phep co.
 *
 * @param {string[]} names
 */
export const requireEnv = (names) => {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
};

// DATABASE_URL la bien duy nhat moi entrypoint deu can.
requireEnv(['DATABASE_URL']);

export default env;
