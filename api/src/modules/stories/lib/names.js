// Thay tên thật bằng token {NVn} trước khi lưu/gửi AI (spec §6). Hàm thuần, không DB.
// Khớp: ranh giới từ Unicode, phân biệt hoa thường, NFC hai phía, tên dài trước.

const nfc = (s) => String(s).normalize('NFC');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
const WORD = String.raw`[\p{L}\p{N}]`;

const buildRegex = (names) =>
  new RegExp(`(?<!${WORD})(?:${names.map(escapeRegex).join('|')})(?!${WORD})`, 'gu');

export const buildNameContext = ({ storyCharacters = [], children = [] }) => {
  const nameMap = [];
  const seen = new Set();
  const add = (rawName, token) => {
    const name = nfc(rawName ?? '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    nameMap.push({ name, token });
  };

  for (const c of storyCharacters) add(c.name, c.token);
  for (const child of children) {
    const linked = storyCharacters.find((c) => c.childId && c.childId === child.id);
    if (linked) add(child.name, linked.token);
  }

  // Mọi tên (nhân vật + mọi con, đã gắn hay chưa) đều bị cấm trong chữ gửi/nhận từ AI (spec §7).
  const forbidden = new Set();
  for (const c of storyCharacters) {
    const name = nfc(c.name ?? '').trim();
    if (name) forbidden.add(name);
  }
  for (const child of children) {
    const name = nfc(child.name ?? '').trim();
    if (name) forbidden.add(name);
  }
  return { nameMap, forbiddenTerms: [...forbidden] };
};

export const tokenizeNames = (text, nameMap) => {
  if (text == null) return null;
  const normalized = nfc(text);
  if (!nameMap?.length) return normalized;
  const byName = new Map(nameMap.map((m) => [nfc(m.name), m.token]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  // Một lượt quét duy nhất: token vừa chèn không bị quét lại; tên dài đứng trước trong alternation.
  return normalized.replace(buildRegex(names), (match) => byName.get(match));
};

export const findLeftoverNames = (text, forbiddenTerms) => {
  if (text == null || !forbiddenTerms?.length) return [];
  const normalized = nfc(text);
  return forbiddenTerms.filter((term) => buildRegex([nfc(term)]).test(normalized));
};

/**
 * Doi nhan vat (bindCharacters): token cua nhan vat BI BO con nam trong chu da luu.
 * oldCharacters: [{ token, characterId, name }]; keptCharacterIds: characterId cua bo moi.
 * Nhan vat khong co characterId (alias) luon tinh la bi bo. `texts` la chuoi hoac mang chuoi.
 * Tra ve [{ token, name }] theo thu tu oldCharacters.
 */
export const findDroppedTokens = (texts, oldCharacters, keptCharacterIds) => {
  const all = (Array.isArray(texts) ? texts : [texts]).filter((t) => t != null).join('\n');
  const kept = new Set(keptCharacterIds);
  // Token co dang {NVn} nen so khop nguyen chuoi ke ca ngoac: {NV1} khong khop {NV10}.
  return oldCharacters
    .filter((c) => !(c.characterId && kept.has(c.characterId)) && all.includes(c.token))
    .map((c) => ({ token: c.token, name: c.name }));
};
