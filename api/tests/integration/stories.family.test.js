// "Ke chuyen nha minh" (spec family-story §5, §6.1): POST /stories/analyze (AI stub tiem vao service)
// va POST /stories entry = family / topic.
import { hasTestDb } from './_db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  prisma,
  createParent,
  createChild,
  createCharacter,
  createFixedSlotTopic,
  retireTopic,
  startServer,
} from './_fixtures.js';
import { analyzeStory } from '../../src/modules/stories/stories.analysis.service.js';
import { loadGenerationInput } from '../../src/modules/stories/stories.generation.store.js';
import { buildAiRequest } from '../../src/modules/stories/lib/aiRequest.js';

const skip = !hasTestDb;
let api;
let topic;
let subA; // emotion_pick, khong can nhan vat phu
let subB; // role_choice

const SITUATION = 'Bin đang xếp lego thì Mít làm đổ tháp, Bin giận và đẩy Mít ngã.';

before(async () => {
  if (skip) return;
  api = await startServer();
  topic = await createFixedSlotTopic({ formats: [['emotion_pick', false], ['role_choice', false]] });
  const links = await prisma.topicSubSkill.findMany({
    where: { topicId: topic.id },
    select: { subSkill: { select: { id: true, code: true, displayOrder: true } } },
  });
  [subA, subB] = links.map((l) => l.subSkill).sort((a, b) => a.displayOrder - b.displayOrder);
});

after(async () => {
  if (topic) await retireTopic(topic);
  if (api) await api.close();
  await prisma.$disconnect();
});

async function family() {
  const { user, token } = await createParent();
  const child = await prisma.childProfile.create({ data: { parentId: user.id, name: 'Bin', birthDate: new Date('2020-01-15') } });
  await createChild(user.id, 'Na');
  const bin = await createCharacter(user.id, 'Bin', { childId: child.id });
  const mit = await createCharacter(user.id, 'Mít');
  return { user, token, bin, mit, characters: [{ characterId: bin.id, isMain: true }, { characterId: mit.id, isMain: false }] };
}

/** AI stub: ghi lai payload, tra khoanh khac (hoac tinh tiet) voi ma da chon. */
const stubAi = (result) => {
  const calls = [];
  const callAi = async (job, payload) => {
    calls.push({ job, payload });
    return { reasons: ['x'], usage: { input_tokens: 10, output_tokens: 5 }, provider: 'mock', model: 'mock-1', ...result(payload) };
  };
  return { calls, callAi };
};

const analyze = (f, result, over = {}) => {
  const ai = stubAi(result);
  return analyzeStory(f.user, { situation: SITUATION, characters: f.characters, length: 'medium', ...over }, { callAi: ai.callAi })
    .then((data) => ({ data, calls: ai.calls }));
};

const momentAB = () => ({ moment_summary: '{NV1} giận khi {NV2} làm đổ tháp', seed_event: null, sub_skill_codes: [subA.code, subB.code] });

const createFamilyStory = (f, analysisToken, over = {}) =>
  api.request('POST', '/stories', {
    token: f.token,
    body: { entry: 'family', length: 'medium', title: 'Tháp lego', situation: SITUATION, characters: f.characters, analysisToken, useTts: false, ...over },
  });

test('analyze: token hoa loi ke truoc AI, danh muc dung duoc, tra chu da thay ten that + token ky, ghi ai_request 0 credit', { skip }, async () => {
  const f = await family();
  const { data, calls } = await analyze(f, momentAB);

  assert.equal(calls.length, 1);
  const { job, payload } = calls[0];
  assert.equal(job, 'story_analysis');
  assert.equal(payload.situation, '{NV1} đang xếp lego thì {NV2} làm đổ tháp, {NV1} giận và đẩy {NV2} ngã.');
  assert.deepEqual(payload.characters.map((c) => [c.token, c.is_main]), [['{NV1}', true], ['{NV2}', false]]);
  assert.ok(payload.catalog.some((c) => c.code === subA.code));
  assert.ok(payload.needs.length <= 5 && payload.needs.every((code) => payload.catalog.some((c) => c.code === code)));
  assert.deepEqual(payload.forced_sub_skills, []);
  assert.deepEqual(payload.limits, { moment_max_words: 25, seed_event_max_words: 30 });
  assert.ok(Number.isInteger(payload.age_min) && payload.age_min === payload.age_max);

  assert.equal(data.momentSummary, 'Bin giận khi Mít làm đổ tháp');
  assert.equal(data.seedEvent, null);
  assert.deepEqual(data.subSkills.map((s) => [s.id, s.source, s.position]), [[subA.id, 'moment', 1], [subB.id, 'moment', 2]]);
  assert.ok(data.subSkills[0].skill.caselCode);
  assert.ok(data.analysisToken && !data.analysisToken.includes('Bin'));
  assert.ok(new Date(data.expiresAt) > new Date());

  const req = await prisma.aiRequest.findFirst({ where: { userId: f.user.id, requestType: 'story_analysis' } });
  assert.equal(req.status, 'succeeded');
  assert.equal(req.creditsCharged, 0);
  assert.equal(req.modelName, 'mock-1');
});

test('analyze: phu huynh chon ky nang -> source parent; AI tra ma ngoai danh sach -> 502; qua luot/ngay -> 429', { skip }, async () => {
  const f = await family();
  const forced = await analyze(f, () => ({ moment_summary: null, seed_event: 'Khủng long con bị lạc mẹ', sub_skill_codes: [subB.code] }), { subSkillIds: [subB.id] });
  assert.deepEqual(forced.calls[0].payload.forced_sub_skills, [subB.code]);
  assert.deepEqual(forced.data.subSkills.map((s) => s.source), ['parent']);
  assert.equal(forced.data.seedEvent, 'Khủng long con bị lạc mẹ');

  await assert.rejects(
    analyze(f, () => ({ moment_summary: 'x', seed_event: null, sub_skill_codes: ['khong_co_ma_nay'] })),
    (e) => e.statusCode === 502,
  );
  const failed = await prisma.aiRequest.findFirst({ where: { userId: f.user.id, requestType: 'story_analysis', status: 'failed' } });
  assert.match(failed.errorMessage, /^OUTPUT_INVALID/);

  await prisma.aiRequest.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      userId: f.user.id, requestType: 'story_analysis', status: 'succeeded', idempotencyKey: `it:analyze:${f.user.id}:${i}`,
    })),
  });
  await assert.rejects(analyze(f, momentAB), (e) => e.statusCode === 429);
});

test('POST /stories/analyze qua HTTP: loi ke ngan -> 400; ten con khong la nhan vat -> 422', { skip }, async () => {
  const f = await family();
  const short = await api.request('POST', '/stories/analyze', { token: f.token, body: { situation: 'ngắn', characters: f.characters, length: 'short' } });
  assert.equal(short.status, 400);
  const leftover = await api.request('POST', '/stories/analyze', {
    token: f.token,
    body: { situation: 'Na giành đồ chơi của Bin rồi chạy đi mất tiêu.', characters: f.characters, length: 'short' },
  });
  assert.equal(leftover.status, 422);
});

test('POST /stories family scored: o cham thu hai la ky nang chinh, luu story_sub_skills, payload sinh co family + anchor', { skip }, async () => {
  const f = await family();
  const { data } = await analyze(f, momentAB);
  const res = await createFamilyStory(f, data.analysisToken);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;

  assert.equal(story.entry, 'family');
  assert.equal(story.scored, true);
  assert.equal(story.topicId, null);
  assert.equal(story.momentSummary, 'Bin giận khi Mít làm đổ tháp');
  assert.equal(story.seedEvent, null);
  assert.deepEqual(story.subSkills.map((s) => [s.id, s.source, s.position]), [[subA.id, 'moment', 1], [subB.id, 'moment', 2]]);

  const row = await prisma.story.findUnique({ where: { id: story.id }, include: { checkpoints: { include: { afterPage: true } } } });
  assert.equal(row.momentSummary, '{NV1} giận khi {NV2} làm đổ tháp');
  assert.equal(row.situation, '{NV1} đang xếp lego thì {NV2} làm đổ tháp, {NV1} giận và đẩy {NV2} ngã.');
  const scored = row.checkpoints.filter((c) => c.type !== 'reflection').sort((a, b) => a.afterPage.pageOrder - b.afterPage.pageOrder);
  // medium: o cham sau trang 2, 4, 5 -> A (xoay vong tu ky nang chinh), A (o neo), B
  assert.deepEqual(scored.map((c) => c.subSkillId), [subA.id, subA.id, subB.id]);

  const list = await api.request('GET', '/stories?limit=50', { token: f.token });
  assert.equal(list.body.data.find((s) => s.id === story.id).entry, 'family');

  const aiReq = await prisma.aiRequest.create({
    data: { userId: f.user.id, requestType: 'story_text', storyId: story.id, idempotencyKey: `it:family:${story.id}` },
  });
  const payload = buildAiRequest(await loadGenerationInput(prisma, aiReq.id));
  assert.equal(payload.topic, null);
  assert.equal(payload.family.anchor_page, 'p4');
  assert.equal(payload.family.moment, '{NV1} giận khi {NV2} làm đổ tháp');
  assert.equal(payload.family.seed_event, null);
  assert.equal(payload.family.sub_skills.length, 2);
  assert.equal(payload.age_min, payload.age_max);

  // Khoa loi ke + nhan vat sau khi tao
  const put = await api.request('PUT', `/stories/${story.id}`, { token: f.token, body: { situation: 'Bin buồn vì Mít không chơi cùng nữa.' } });
  assert.equal(put.status, 409);
  const chars = await api.request('PUT', `/stories/${story.id}/characters`, { token: f.token, body: { characters: f.characters } });
  assert.equal(chars.status, 409);
  const title = await api.request('PUT', `/stories/${story.id}`, { token: f.token, body: { title: 'Tên mới' } });
  assert.equal(title.status, 200);
});

test('POST /stories family scored=false: chi reflection, khong luu seed_event / story_sub_skills', { skip }, async () => {
  const f = await family();
  const { data } = await analyze(f, () => ({ moment_summary: null, seed_event: 'Khủng long con bị lạc mẹ', sub_skill_codes: [subA.code] }));
  const res = await createFamilyStory(f, data.analysisToken, { scored: false });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const story = res.body.data.story;
  assert.equal(story.scored, false);
  assert.equal(story.seedEvent, null);
  assert.deepEqual(story.subSkills, []);
  assert.deepEqual(story.checkpoints.map((c) => c.type), ['reflection']);
  assert.equal(await prisma.storySubSkill.count({ where: { storyId: story.id } }), 0);

  const aiReq = await prisma.aiRequest.create({
    data: { userId: f.user.id, requestType: 'story_text', storyId: story.id, idempotencyKey: `it:family:${story.id}` },
  });
  const payload = buildAiRequest(await loadGenerationInput(prisma, aiReq.id));
  assert.equal(payload.family.anchor_page, 'p7');
  assert.deepEqual(payload.family.sub_skills, []);
});

test('POST /stories family: token khong khop loi ke / nhan vat / chu truyen -> 422, khong tao truyen', { skip }, async () => {
  const f = await family();
  const { data } = await analyze(f, momentAB);

  const otherText = await createFamilyStory(f, data.analysisToken, { situation: `${SITUATION} Rồi hai bạn làm lành.` });
  assert.equal(otherText.status, 422);
  const swapped = await createFamilyStory(f, data.analysisToken, {
    characters: [{ characterId: f.mit.id, isMain: true }, { characterId: f.bin.id, isMain: false }],
  });
  assert.equal(swapped.status, 422);
  const forged = await createFamilyStory(f, `${data.analysisToken.split('.')[0]}.AAAA`);
  assert.equal(forged.status, 422);
  assert.equal(await prisma.story.count({ where: { ownerId: f.user.id } }), 0);

  const other = await family();
  const stolen = await api.request('POST', '/stories', {
    token: other.token,
    body: { entry: 'family', length: 'medium', title: 'x', situation: SITUATION, characters: other.characters, analysisToken: data.analysisToken },
  });
  assert.equal(stolen.status, 422);
});

test('POST /stories topic: gui situation -> 400; khong gui entry -> topic', { skip }, async () => {
  const f = await family();
  const body = { topicId: topic.id, length: 'medium', title: 'Chuyện mẫu', characters: f.characters, useTts: false };
  const bad = await api.request('POST', '/stories', { token: f.token, body: { ...body, entry: 'topic', situation: 'Bin giận Mít vì Mít lấy xe của Bin.' } });
  assert.equal(bad.status, 400);
  const ok = await api.request('POST', '/stories', { token: f.token, body });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.story.entry, 'topic');
  const custom = await api.request('POST', '/stories', { token: f.token, body: { length: 'custom', title: 'Tự viết', characters: f.characters } });
  assert.equal(custom.body.data.story.entry, 'handwritten');
});
