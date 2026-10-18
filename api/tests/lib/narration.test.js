import test from 'node:test';
import assert from 'node:assert/strict';
import {
  childReadiness,
  detokenize,
  fingerprintOf,
  narrationJobId,
  narrationProgress,
  narrationSegments,
  planNarration,
} from '../../src/modules/stories/lib/narration.js';

const VOICE = 'Kim Thanh';
const chars = [
  { token: '{NV1}', character: { name: 'Bin' } },
  { token: '{NV2}', aliasName: 'Mẹ', character: null },
];

// Trang 2 co diem dung problem_solving (cau hoi, 3 phuong an co feedback); trang 3 co perspective
// khong hint, phuong an khong feedback; trang 1 trong chu (chua viet).
const story = (over = {}) => ({
  useTts: true,
  reviewedAt: new Date('2026-10-17T00:00:00Z'),
  storyCharacters: chars,
  pages: [
    { id: 'p3', pageOrder: 3, contentText: '{NV2} ôm {NV1}.' },
    { id: 'p1', pageOrder: 1, contentText: '   ' },
    { id: 'p2', pageOrder: 2, contentText: '{NV1} giận lắm.' },
  ],
  checkpoints: [
    {
      id: 'k2', afterPageId: 'p2', question: '{NV1} nên làm gì?', hint: null,
      options: [
        { id: 'o2', optionOrder: 2, text: 'Chạy đi', feedback: '{NV1} chạy vào phòng.' },
        { id: 'o1', optionOrder: 1, text: 'Hít thở', feedback: 'Dịu dần.' },
      ],
    },
    {
      id: 'k3', afterPageId: 'p3', question: 'Vì sao {NV2} ôm?', hint: 'Nhìn mặt {NV2} kìa.',
      options: [{ id: 'o9', optionOrder: 1, text: 'Vì thương', feedback: null }],
    },
  ],
  ...over,
});

const readyClips = (s, voice = VOICE) =>
  narrationSegments(s).map((seg, i) => ({
    id: `c${i}`, segment: seg.segment, fingerprint: fingerprintOf(seg.text, voice), status: 'ready', round: 1,
  }));

test('detokenize: token -> ten nhan vat, alias cho nhan vat khong tai khoan, token la giu nguyen', () => {
  assert.equal(detokenize('{NV1} và {NV2} gặp {NV7}.', chars), 'Bin và Mẹ gặp {NV7}.');
});

test('narrationSegments: thu tu doc trang -> diem dung sau no, bo doan trong, thay ten that', () => {
  const segs = narrationSegments(story());
  assert.deepEqual(segs.map((s) => s.segment), [
    'page:p2',
    'checkpoint:k2:question',
    'option:o1:text', 'option:o1:feedback',
    'option:o2:text', 'option:o2:feedback',
    'page:p3',
    'checkpoint:k3:question', 'checkpoint:k3:hint',
    'option:o9:text',
  ]);
  assert.equal(segs[0].text, 'Bin giận lắm.');
  assert.equal(segs.find((s) => s.segment === 'checkpoint:k3:hint').text, 'Nhìn mặt Mẹ kìa.');
  assert.ok(segs.every((s) => !s.text.includes('{NV')));
});

test('fingerprintOf: doi chu, doi giong deu doi van tay; NFC + trim thi khong', () => {
  const base = fingerprintOf('Bìn vui.', VOICE);
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(fingerprintOf('  Bi\u0300n vui. ', VOICE), base);
  assert.notEqual(fingerprintOf('Bìn buồn.', VOICE), base);
  assert.notEqual(fingerprintOf('Bìn vui.', 'Hải Đăng'), base);
});

test('planNarration: chua co clip -> tat ca vao hang doi', () => {
  const { toQueue, staleClipIds } = planNarration(narrationSegments(story()), [], VOICE);
  assert.equal(toQueue.length, 10);
  assert.ok(toQueue.every((t) => t.clipId === null && t.fingerprint.length === 64));
  assert.deepEqual(staleClipIds, []);
});

test('planNarration: chi doan lech / loi duoc dua lai; khop va dang chay thi giu', () => {
  const s = story();
  const clips = readyClips(s);
  clips[1].status = 'queued'; // dang cho — khong sinh trung
  clips[2].status = 'generating';
  clips[3].status = 'failed'; // loi -> thu lai
  clips[4].fingerprint = 'x'.repeat(64); // chu da sua
  clips.push({ id: 'gone', segment: 'page:deleted', fingerprint: 'y', status: 'ready', round: 1 });
  const { toQueue, staleClipIds } = planNarration(narrationSegments(s), clips, VOICE);
  assert.deepEqual(toQueue.map((t) => t.clipId), ['c3', 'c4']);
  assert.deepEqual(staleClipIds, ['gone']);
});

test('narrationProgress: dem ready / pending / failed / missing; tat giong -> complete', () => {
  const s = story();
  const clips = readyClips(s);
  clips[0].status = 'generating';
  clips[1].status = 'failed';
  clips[2].fingerprint = 'z'.repeat(64);
  clips.splice(3, 1);
  assert.deepEqual(narrationProgress(s, clips, VOICE), {
    enabled: true, total: 10, ready: 6, pending: 1, failed: 1, missing: 2, complete: false,
  });
  assert.equal(narrationProgress(s, readyClips(s), VOICE).complete, true);
  assert.deepEqual(narrationProgress(story({ useTts: false }), [], VOICE), {
    enabled: false, total: 0, ready: 0, pending: 0, failed: 0, missing: 0, complete: true,
  });
});

test('childReadiness: can reviewed_at VA (tat giong HOAC du audio khop chu hien tai)', () => {
  const s = story();
  assert.equal(childReadiness({ ...s, reviewedAt: null }, readyClips(s), VOICE).reason, 'not_reviewed');
  assert.deepEqual(
    { ready: childReadiness(s, readyClips(s), VOICE).ready, reason: childReadiness(s, readyClips(s), VOICE).reason },
    { ready: true, reason: null },
  );
  assert.equal(childReadiness(s, [], VOICE).reason, 'narration_incomplete');
  assert.equal(childReadiness(story({ useTts: false }), [], VOICE).ready, true);
});

test('childReadiness: sua chu sau khi hoan tat -> mat san sang (audio doc ban cu)', () => {
  const s = story();
  const clips = readyClips(s);
  const edited = story({ pages: s.pages.map((p) => (p.id === 'p2' ? { ...p, contentText: '{NV1} hết giận.' } : p)) });
  assert.equal(childReadiness(s, clips, VOICE).ready, true);
  const after = childReadiness(edited, clips, VOICE);
  assert.equal(after.ready, false);
  assert.equal(after.narration.missing, 1);
});

test('childReadiness: doi ten nhan vat hoac doi giong -> lech van tay moi doan lien quan', () => {
  const s = story();
  const clips = readyClips(s);
  const renamed = story({ storyCharacters: [{ token: '{NV1}', character: { name: 'Bông' } }, chars[1]] });
  // Doan co {NV1}: page p2, cau hoi k2, feedback o2, page p3
  assert.equal(narrationProgress(renamed, clips, VOICE).missing, 4);
  assert.equal(narrationProgress(s, clips, 'Hải Đăng').ready, 0);
});

test('narrationJobId: khong co dau ":" (BullMQ cam), doi theo luot', () => {
  const a = narrationJobId('11111111-1111-1111-1111-111111111111', 1);
  assert.ok(!a.includes(':'));
  assert.notEqual(a, narrationJobId('11111111-1111-1111-1111-111111111111', 2));
});
