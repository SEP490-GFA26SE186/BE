import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { DEMO_USERS, DEMO_PASSWORD, DEMO_KID_PIN, demoGrantKey } = await import('../../prisma/seed_demo.js');

const DOC_URL = new URL('../../../../Web/docs/DEMO_ACCOUNTS.md', import.meta.url);

test('seed demo: dung 3 vai tro', () => {
  assert.deepEqual(DEMO_USERS.map((u) => u.role).sort(), ['admin', 'parent', 'specialist']);
});

// Repo Web nam canh BE (D:/sep490/Web); clone rieng BE (CI) thi bo qua thay vi fail.
test('seed demo: email / sdt / mat khau / PIN khop Web/docs/DEMO_ACCOUNTS.md', { skip: !existsSync(DOC_URL) }, () => {
  const doc = readFileSync(DOC_URL, 'utf8');
  for (const u of DEMO_USERS) {
    assert.ok(doc.includes(u.email), u.email);
    assert.ok(doc.includes(u.phone), u.phone);
  }
  assert.ok(doc.includes(`**\`${DEMO_PASSWORD}\`**`));
  assert.ok(doc.includes(`\`${DEMO_KID_PIN}\``));
});

test('seed demo: username khong trung, khoa cap credit co dinh theo user', () => {
  assert.equal(new Set(DEMO_USERS.map((u) => u.username)).size, DEMO_USERS.length);
  assert.equal(demoGrantKey('u1'), demoGrantKey('u1'));
  assert.ok(demoGrantKey('u1').length <= 120); // idempotency_key varchar(120)
});

// ---------------------------------------------------------------------------
// Truyen demo cua Bin theo khung CASEL (du lieu thuan, khong DB)
// ---------------------------------------------------------------------------
const { DEMO_STORIES, DEMO_CUSTOM_STORY, DEMO_TITLE_PREFIX } = await import('../../prisma/data/demo_stories.js');
const { CASEL_REFERENCES } = await import('../../prisma/data/casel.js');
const { SUB_SKILLS } = await import('../../prisma/data/pedagogy.js');
const { topicsData } = await import('../../prisma/seed_topics.js');
const { buildEqLevels } = await import('../../src/modules/children/lib/eqLevels.js');
const { DEFAULT_REPORT_SETTINGS } = await import('../../src/modules/pedagogy-settings/lib/reportSettings.js');

const templateOf = (cp) =>
  SUB_SKILLS.find((s) => s.code === cp.subCode)?.templates.find((t) => t.title === cp.templateTitle && t.answerFormat === cp.format);
const TOKENS = /\{NV(\d)\}/g;

test('truyen demo: tieu de co tien to co dinh va khong trung nhau', () => {
  const titles = [...DEMO_STORIES, DEMO_CUSTOM_STORY].map((s) => s.title);
  assert.ok(titles.every((t) => t.startsWith(DEMO_TITLE_PREFIX)));
  assert.equal(new Set(titles).size, titles.length);
});

test('truyen demo: topic co that, ky nang con thuoc topic, mau co that va dung dang tra loi', () => {
  for (const s of DEMO_STORIES) {
    const topic = topicsData.find((t) => t.title === s.topicTitle);
    assert.ok(topic, s.topicTitle);
    for (const cp of s.checkpoints) {
      assert.ok(topic.subSkillCodes.includes(cp.subCode), `${s.title}: ${cp.subCode} khong thuoc topic`);
      const tpl = templateOf(cp);
      assert.ok(tpl, `${s.title}: khong co mau "${cp.templateTitle}"`);
      assert.equal(tpl.needsTarget, false, 'demo chi dung ban khong nhan vat khac');
    }
  }
});

test('truyen demo: diem dung nam trong trang, khong trung vi tri, phuong an dung luat', () => {
  for (const s of DEMO_STORIES) {
    const afters = [...s.checkpoints.map((c) => c.after), s.reflection.after];
    assert.equal(new Set(afters).size, afters.length);
    assert.ok(afters.every((a) => a >= 1 && a <= s.pages.length), s.title);
    assert.ok(s.pages.every((p) => p.scene >= 1 && p.scene <= s.scenes.length));
    assert.ok(s.scenes.length <= 4);
    assert.equal(s.session.answers.length, s.checkpoints.length);
    for (const cp of s.checkpoints) {
      if (cp.format === 'single_correct') {
        assert.equal(cp.options.length, 3);
        assert.equal(cp.options.filter((o) => o.isCorrect).length, 1);
      } else if (cp.format === 'role_choice') {
        assert.deepEqual(cp.options.map((o) => o.role).sort(), ['avoidant', 'constructive', 'impulsive']);
      } else {
        assert.ok(['happy', 'sad', 'angry', 'scared', 'neutral'].includes(cp.answerEmotion));
      }
    }
  }
});

test('truyen demo: van ban chi dung token {NV1}/{NV2} va khong ten that', () => {
  for (const s of [...DEMO_STORIES, DEMO_CUSTOM_STORY]) {
    const text = [...s.pages.map((p) => p.text), ...(s.checkpoints ?? []).flatMap((c) => [c.hint, ...(c.options ?? []).map((o) => o.text)])].join(' ');
    assert.ok([...text.matchAll(TOKENS)].every((m) => m[1] === '1' || m[1] === '2'));
    assert.ok(!/\bBin\b/.test(text), `${s.title}: ten that Bin lot vao van ban`);
  }
  assert.equal(DEMO_CUSTOM_STORY.length, 'custom');
  assert.equal(DEMO_CUSTOM_STORY.topicTitle, undefined);
  assert.equal(DEMO_CUSTOM_STORY.checkpoints, undefined);
});

test('truyen demo: lich su luot dau cho bao cao >= 2 nang luc co muc va >= 1 nang luc chua co du lieu', () => {
  const SCORE = { constructive: 1, avoidant: 0.5, impulsive: 0 };
  const skills = ['self_awareness', 'self_management', 'social_awareness', 'relationship_skills', 'responsible_decision_making']
    .map((caselCode, i) => ({ id: caselCode, caselCode, nameVi: caselCode, displayOrder: i }));
  // Nang luc cua ky nang con = nang luc cua muc CASEL no tro vao
  const subs = SUB_SKILLS.map((s, i) => ({
    id: s.code, skillId: CASEL_REFERENCES.find((c) => c.code === s.caselCode).skill, nameVi: s.code, displayOrder: i,
  }));

  const rows = [];
  for (const s of DEMO_STORIES) {
    s.checkpoints.forEach((cp, i) => {
      const pick = s.session.answers[i];
      const score = cp.format === 'role_choice' ? SCORE[pick.pick]
        : cp.format === 'single_correct' ? (cp.options[pick.pick].isCorrect ? 1 : 0)
        : (pick.pick === cp.answerEmotion ? 1 : 0);
      rows.push({ subSkillId: cp.subCode, score, at: -s.session.daysAgo * 100 + i });
    });
  }
  rows.sort((a, b) => b.at - a.at); // moi -> cu
  const { competencies } = buildEqLevels(rows, skills, subs, DEFAULT_REPORT_SETTINGS);
  assert.ok(competencies.filter((c) => c.level).length >= 2, JSON.stringify(competencies.map((c) => c.level)));
  assert.ok(competencies.filter((c) => !c.level).length >= 1);
  // Ngay tra loi trai rong 3-4 tuan
  const days = DEMO_STORIES.map((s) => s.session.daysAgo);
  assert.ok(Math.max(...days) >= 21 && Math.max(...days) <= 30 && Math.min(...days) <= 7);
});
