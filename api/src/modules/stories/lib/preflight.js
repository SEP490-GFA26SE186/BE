// Kiem tra truoc khi sinh (truoc khi giu credit): noi dung gui/lien quan toi ai/ con sot ten that
// khong? Ham thuan, khong DB.
//
// `appearance` luu nguyen van (token hoa luc dung request) va `situation`/chu trang/diem dung luu tu
// truoc khi co ho so con -> co the chua ten con khong la nhan vat. De lot thi ai/ tra
// FORBIDDEN_TERM_DETECTED -> `blocked`, phu huynh khong biet sua o dau. Chan som bang 422.
import { findLeftoverNames, tokenizeNames } from './names.js';

/**
 * @param {object} input
 * @param {{ token: string, name: string|null, appearance: string|null }[]} input.characters
 * @param {string|null} input.situation  da luu dang token
 * @param {{ pageOrder: number, contentText: string|null }[]} input.pages
 * @param {{ afterPageOrder: number, question: string|null, hint: string|null,
 *           options: { optionOrder: number, text: string|null, feedback: string|null }[] }[]} input.checkpoints
 * @param {{ nameMap: object[], forbiddenTerms: string[] }} nameContext
 * @returns {{ path: string, name: string, message: string }[]} rong = sinh duoc
 */
export const findGenerationNameIssues = ({ characters = [], situation, pages = [], checkpoints = [] }, nameContext) => {
  const { nameMap, forbiddenTerms } = nameContext;
  const issues = [];
  const check = (text, path, where) => {
    if (text == null || text === '') return;
    for (const name of findLeftoverNames(text, forbiddenTerms)) {
      issues.push({ path, name, message: `${where} chứa tên "${name}" chưa có trong truyện` });
    }
  };

  for (const c of characters) {
    const label = c.name?.trim() ? c.name : c.token;
    check(tokenizeNames(c.appearance, nameMap), `characters.${c.token}.appearance`, `Mô tả nhân vật "${label}"`);
  }
  check(situation, 'situation', 'Tình huống');
  for (const p of [...pages].sort((a, b) => a.pageOrder - b.pageOrder)) {
    check(p.contentText, `pages.${p.pageOrder}.contentText`, `Trang ${p.pageOrder}`);
  }
  for (const k of [...checkpoints].sort((a, b) => a.afterPageOrder - b.afterPageOrder)) {
    const base = `checkpoints.${k.afterPageOrder}`;
    const where = `Điểm dừng sau trang ${k.afterPageOrder}`;
    check(k.question, `${base}.question`, where);
    check(k.hint, `${base}.hint`, where);
    for (const o of [...(k.options ?? [])].sort((a, b) => a.optionOrder - b.optionOrder)) {
      check(o.text, `${base}.options.${o.optionOrder}.text`, `${where} (phương án ${o.optionOrder})`);
      check(o.feedback, `${base}.options.${o.optionOrder}.feedback`, `${where} (phản hồi ${o.optionOrder})`);
    }
  }
  return issues;
};
