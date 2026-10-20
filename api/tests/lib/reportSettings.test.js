import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REPORT_SETTINGS, REPORT_SETTING_KEYS, parseReportSettings, reportSettingsRows,
} from '../../src/modules/pedagogy-settings/lib/reportSettings.js';

test('parseReportSettings: doc khoa eq_report.*, thieu / sai kieu -> mac dinh', () => {
  assert.deepEqual(DEFAULT_REPORT_SETTINGS, { window: 5, minItems: 3, developingFrom: 0.5, secureFrom: 0.8 });
  assert.deepEqual(parseReportSettings([]), DEFAULT_REPORT_SETTINGS);
  assert.deepEqual(
    parseReportSettings([
      { key: 'eq_report.window', value: 8 },
      { key: 'eq_report.min_items', value: '4' },
      { key: 'eq_report.developing_from', value: 'abc' },
      { key: 'eq_report.secure_from', value: 0.9 },
    ]),
    { window: 8, minItems: 4, developingFrom: 0.5, secureFrom: 0.9 },
  );
});

test('reportSettingsRows: doi lai thanh khoa platform_settings', () => {
  assert.deepEqual(REPORT_SETTING_KEYS, ['eq_report.window', 'eq_report.min_items', 'eq_report.developing_from', 'eq_report.secure_from']);
  assert.deepEqual(reportSettingsRows({ window: 6, minItems: 2, developingFrom: 0.4, secureFrom: 0.75 }), [
    { key: 'eq_report.window', value: 6 },
    { key: 'eq_report.min_items', value: 2 },
    { key: 'eq_report.developing_from', value: 0.4 },
    { key: 'eq_report.secure_from', value: 0.75 },
  ]);
});
