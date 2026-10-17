import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudinarySignedUrl } from '../../src/clients/assetUrl.js';

// Vector sinh bang SDK Python chinh thuc (cloudinary 1.x):
//   cloudinary.config(cloud_name='demo-cloud', api_key='key-123', api_secret='secret-abc', secure=True)
//   cloudinary_url(public_id, resource_type=rt, type='authenticated', sign_url=True, format=fmt)
const CFG = { cloudName: 'demo-cloud', apiSecret: 'secret-abc', folder: 'sw' };

test('cloudinarySignedUrl: anh -> image, bo duoi khoi public_id, ep v1 khi co thu muc', () => {
  assert.equal(
    cloudinarySignedUrl('a/r1-1.png', CFG),
    'https://res.cloudinary.com/demo-cloud/image/authenticated/s--_tR1m-NI--/v1/sw/a/r1-1.png',
  );
});

test('cloudinarySignedUrl: audio -> resource video (khop ai/app/storage/cloudinary.py)', () => {
  assert.equal(
    cloudinarySignedUrl('n/r2-1.wav', CFG),
    'https://res.cloudinary.com/demo-cloud/video/authenticated/s--IAA3hkS1--/v1/sw/n/r2-1.wav',
  );
});

test('cloudinarySignedUrl: khong folder, khong thu muc -> khong co v1', () => {
  assert.equal(
    cloudinarySignedUrl('plain.webp', { ...CFG, folder: '' }),
    'https://res.cloudinary.com/demo-cloud/image/authenticated/s--h44F77Jy--/plain.webp',
  );
});

test('cloudinarySignedUrl: file raw giu duoi trong public_id', () => {
  assert.equal(
    cloudinarySignedUrl('doc/x.json', CFG),
    'https://res.cloudinary.com/demo-cloud/raw/authenticated/s--wR5kJPfL--/v1/sw/doc/x.json',
  );
});

test('cloudinarySignedUrl: folder co dau / thua van ra cung link', () => {
  assert.equal(cloudinarySignedUrl('a/r1-1.png', { ...CFG, folder: '/sw/' }), cloudinarySignedUrl('a/r1-1.png', CFG));
});
