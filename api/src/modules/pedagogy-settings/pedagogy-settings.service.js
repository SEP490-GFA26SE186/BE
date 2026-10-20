// Tham so bao cao EQ (platform_settings eq_report.*) — Specialist / Admin doc + sua.
// Children service doc qua loadReportSettings (phu huynh nhan tham so ben trong bao cao).
import { prisma } from '../../config/index.js';
import { REPORT_SETTING_KEYS, parseReportSettings, reportSettingsRows } from './lib/reportSettings.js';

export const loadReportSettings = async (db = prisma) =>
  parseReportSettings(await db.platformSetting.findMany({ where: { key: { in: REPORT_SETTING_KEYS } }, select: { key: true, value: true } }));

const getReportSettings = () => loadReportSettings();

const updateReportSettings = async (user, settings) => {
  await prisma.$transaction(
    reportSettingsRows(settings).map(({ key, value }) =>
      prisma.platformSetting.upsert({ where: { key }, create: { key, value, updatedBy: user.id }, update: { value, updatedBy: user.id } }),
    ),
  );
  return loadReportSettings();
};

export default { getReportSettings, updateReportSettings };
