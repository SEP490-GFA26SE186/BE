// Doi storage key (ai/ upload, luu trong DB) -> link cho client hien anh / phat audio.
//
// ai/ upload len Cloudinary voi type=authenticated (file cua tre: ten that, chuyen that), nen link
// cong khai `.../upload/...` KHONG mo duoc. Link o day la "signed delivery URL" cua Cloudinary:
// `.../authenticated/s--<chu ky>--/v1/<public_id>.<ext>`, chu ky = 8 ky tu dau cua
// base64url(SHA-1("<public_id>.<ext>" + api_secret)). Khong can goi mang, di qua CDN.
// Khong doan duoc neu khong co api_secret, nhung KHONG het han (het han can token auth — goi tra phi).
//
// Anh xa key -> public_id PHAI khop ai/app/storage/cloudinary.py: folder + key, bo duoi voi anh / audio.
// Kiem bang vector sinh tu SDK Python chinh thuc (tests/lib/assetUrl.test.js).

import crypto from 'node:crypto';
import env from '../config/env.js';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const VIDEO_EXT = new Set(['wav', 'mp3', 'm4a', 'ogg', 'mp4']);

const resourceTypeOf = (ext) => (IMAGE_EXT.has(ext) ? 'image' : VIDEO_EXT.has(ext) ? 'video' : 'raw');

/**
 * Link Cloudinary co chu ky cho `key`. Thuan, khong doc env — de test.
 * @param {string} key  vd 'stories/<id>/scenes/<req>-1.png'
 * @param {{ cloudName: string, apiSecret: string, folder?: string }} config
 */
export function cloudinarySignedUrl(key, { cloudName, apiSecret, folder = '' }) {
  const dot = key.lastIndexOf('.');
  const ext = dot > key.lastIndexOf('/') ? key.slice(dot + 1).toLowerCase() : '';
  const resourceType = resourceTypeOf(ext);
  const stem = resourceType === 'raw' || !ext ? key : key.slice(0, dot);
  const prefix = folder.replace(/^\/+|\/+$/g, '');
  const publicId = prefix ? `${prefix}/${stem}` : stem;
  // File raw da co duoi trong public_id; anh / audio gan format vao sau.
  const source = resourceType === 'raw' || !ext ? publicId : `${publicId}.${ext}`;

  const signature = crypto
    .createHash('sha1')
    .update(source + apiSecret)
    .digest('base64url')
    .slice(0, 8);
  // SDK ep 'v1' khi public_id co thu muc; version khong nam trong chuoi ky.
  const version = source.includes('/') ? 'v1/' : '';
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/authenticated/s--${signature}--/${version}${source}`;
}

/**
 * Link cho client, hoac null khi chua co file / chua cau hinh Cloudinary
 * (LocalStorage nam trong container ai/, client khong mo duoc).
 * Key da la URL day du (du lieu cu nhap tay) -> tra nguyen.
 * @param {string | null | undefined} key
 * @returns {string | null}
 */
export function assetUrl(key) {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const { cloudName, apiSecret, folder } = env.cloudinary;
  if (!cloudName || !apiSecret) return null;
  return cloudinarySignedUrl(key, { cloudName, apiSecret, folder });
}
