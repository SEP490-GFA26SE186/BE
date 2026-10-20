// Luat nghiep vu cua mau cau hoi: du truong de ban hanh, dang tra loi -> kieu checkpoint, tinh diem.
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../utils/ApiError.js';

export const EMOTIONS = ['happy', 'sad', 'angry', 'scared', 'neutral'];
const ROLES = ['constructive', 'avoidant', 'impulsive'];

const blank = (v) => v == null || String(v).trim() === '';
const num = (v) => (v == null ? NaN : Number(v));

/** Tra ve danh sach ten truong con thieu / sai (rong = day du). */
const missingFields = (format, v) => {
  const missing = [];
  for (const f of ['questionFrame', 'pageSetup', 'rationale']) if (blank(v[f])) missing.push(f);
  const prompts = (v.parentPrompts ?? []).filter((p) => !blank(p));
  if (prompts.length < 2 || prompts.length > 3) missing.push('parentPrompts (2-3 câu)');

  if (format === 'emotion_pick') {
    if (blank(v.hintGuidance)) missing.push('hintGuidance');
    if ((v.allowedEmotions ?? []).some((e) => !EMOTIONS.includes(e))) missing.push('allowedEmotions (chỉ happy, sad, angry, scared, neutral)');
  } else if (format === 'single_correct') {
    for (const f of ['correctDesc', 'distractorDesc', 'hintGuidance']) if (blank(v[f])) missing.push(f);
  } else if (format === 'role_choice') {
    for (const r of ROLES) if (blank(v[`${r}Desc`])) missing.push(`${r}Desc`);
    for (const r of ROLES) {
      const s = num(v[`${r}Score`]);
      if (Number.isNaN(s) || s < 0 || s > 1) missing.push(`${r}Score (0-1)`);
    }
    const c = num(v.constructiveScore);
    if (!Number.isNaN(c) && ROLES.slice(1).some((r) => num(v[`${r}Score`]) >= c)) missing.push('constructiveScore (phải lớn nhất)');
  }
  return missing;
};

/** Nem 422 liet ke cac truong thieu neu phien ban chua du de ban hanh. */
export const assertVersionComplete = (format, version) => {
  const missing = missingFields(format, version ?? {});
  if (missing.length) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, `Chưa đủ để ban hành, thiếu hoặc sai: ${missing.join(', ')}.`, missing);
  }
};

/** emotion_pick -> emotion_other (co doi tuong) | emotion_self; single_correct -> perspective; role_choice -> problem_solving. */
export const checkpointTypeFor = (format, needsTarget) => {
  if (format === 'emotion_pick') return needsTarget ? 'emotion_other' : 'emotion_self';
  if (format === 'single_correct') return 'perspective';
  return 'problem_solving';
};

/**
 * Diem 0..1 cua mot cau tra loi. Dang tra loi lay tu `version.answerFormat`, neu khong co thi tu
 * `version.template.answerFormat`. role_choice -> diem theo vai (Decimal ep Number); dang khac -> correct ? 1 : 0.
 */
export const scoreFor = (version, { correct, role } = {}) => {
  const format = version.answerFormat ?? version.template?.answerFormat;
  if (format === 'role_choice') return Number(version[`${role}Score`]);
  return correct ? 1 : 0;
};
