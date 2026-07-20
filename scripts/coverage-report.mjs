#!/usr/bin/env node
/**
 * Runs Vitest with coverage, then prints a unit vs UI/integration feature matrix.
 * UI/integration tests replaced the former Playwright E2E suite.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const UNIT_TESTS = [
  { file: 'src/api/device/__tests__/OnlyKeyDevice.test.ts', area: 'Device API', tests: 3 },
  { file: 'src/api/device/__tests__/ResponseParser.test.ts', area: 'Response parsing', tests: 7 },
  { file: 'src/api/device/__tests__/firmwareConstants.test.ts', area: 'Firmware constants', tests: 3 },
  { file: 'src/utils/__tests__/backupVerify.test.ts', area: 'Backup verification', tests: 2 },
  { file: 'src/utils/__tests__/passwordGenerator.test.ts', area: 'Password generator', tests: 3 },
  { file: 'src/utils/__tests__/mockDevice.test.ts', area: 'Mock device flag', tests: 3 },
  { file: 'src/store/__tests__/recentMessages.ui.test.ts', area: 'Message retention (store)', tests: 1 },
];

const UI_TESTS = [
  { file: 'src/App.ui.test.tsx', area: 'App shell', features: ['disconnected overlay', 'Tools exception', 'nav', 'theme', 'lock screen'] },
  { file: 'src/App.navigation.ui.test.tsx', area: 'Navigation', features: ['all 8 tabs', 'a11y nav label'] },
  { file: 'src/App.theme.ui.test.tsx', area: 'Theme / status', features: ['light mode contrast', 'theme while locked/disconnected'] },
  { file: 'src/App.integration.ui.test.tsx', area: 'Integration (ex-E2E)', features: ['mock connect', 'slots-page layout'] },
  { file: 'src/components/__tests__/LockScreen.ui.test.tsx', area: 'Lock screen', features: ['Classic keypad', 'DUO PIN', 'Tools bypass'] },
  { file: 'src/components/__tests__/SlotGrid.ui.test.tsx', area: 'Slots grid', features: ['Classic pills', 'DUO layout', 'editor open'] },
  { file: 'src/components/__tests__/SlotEditor.ui.test.tsx', area: 'Slot editor', features: ['open/close', 'tabs', 'save', 'wipe', 'DUO no-PIN'] },
  { file: 'src/components/__tests__/Backup.ui.test.tsx', area: 'Backup', features: ['tabs', 'verify', 'DUO restore copy'] },
  { file: 'src/components/__tests__/Preferences.ui.test.tsx', area: 'Preferences', features: ['standard', 'advanced', 'setTypeSpeed'] },
  { file: 'src/components/__tests__/Tools.ui.test.tsx', area: 'Tools', features: ['external links'] },
  { file: 'src/components/__tests__/DeviceMessages.ui.test.tsx', area: 'Status messages', features: ['5-line terminal', 'cap at 5'] },
  { file: 'src/components/__tests__/ThemeToggle.ui.test.tsx', area: 'Theme toggle', features: ['aria-label', 'persist theme'] },
  { file: 'src/components/ui/__tests__/PseudoTabs.ui.test.tsx', area: 'PseudoTabs', features: ['underline tabs'] },
];

const FEATURE_MATRIX = [
  { feature: 'App shell / disconnected state', unit: '—', ui: 'App.ui.test' },
  { feature: 'Sidebar navigation (8 tabs)', unit: '—', ui: 'App.navigation.ui.test' },
  { feature: 'Theme toggle (locked / disconnected)', unit: '—', ui: 'App.theme.ui.test' },
  { feature: 'Mock device connect flow', unit: 'recentMessages.ui.test', ui: 'App.integration.ui.test' },
  { feature: 'Lock screen (Classic / DUO)', unit: '—', ui: 'LockScreen.ui.test' },
  { feature: 'Slot grid + editor', unit: '—', ui: 'SlotGrid + SlotEditor' },
  { feature: 'Backup / restore UI', unit: 'backupVerify.test', ui: 'Backup.ui.test' },
  { feature: 'Preferences', unit: '—', ui: 'Preferences.ui.test' },
  { feature: 'Tools page', unit: '—', ui: 'Tools.ui.test' },
  { feature: 'Device messages sidebar', unit: 'recentMessages.ui.test', ui: 'DeviceMessages.ui.test' },
  { feature: 'HID / device protocol', unit: 'OnlyKeyDevice + ResponseParser', ui: '—' },
  { feature: 'Setup wizard', unit: '—', ui: '— (untested)' },
  { feature: 'Keys import', unit: '—', ui: '— (untested)' },
  { feature: 'Firmware update UI', unit: 'firmwareConstants.test', ui: '— (untested)' },
  { feature: 'Advanced page', unit: '—', ui: '— (untested)' },
];

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function bar(ratio, width = 24) {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

console.log('\n═══ Running Vitest with coverage ═══\n');
const run = spawnSync('npx', ['vitest', 'run', '--coverage'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
if (run.status !== 0) process.exit(run.status ?? 1);

const summaryPath = join(root, 'coverage', 'coverage-summary.json');
if (!existsSync(summaryPath)) {
  console.error('coverage-summary.json not found');
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
delete summary.total;

const rows = Object.entries(summary)
  .map(([file, m]) => ({
    file: file.replace(/\\/g, '/').replace(`${root.replace(/\\/g, '/')}/`, ''),
    ...m,
  }))
  .sort((a, b) => a.lines.pct - b.lines.pct);

const totals = Object.values(summary).reduce(
  (acc, m) => ({
    lines: { covered: acc.lines.covered + m.lines.covered, total: acc.lines.total + m.lines.total },
    statements: { covered: acc.statements.covered + m.statements.covered, total: acc.statements.total + m.statements.total },
    branches: { covered: acc.branches.covered + m.branches.covered, total: acc.branches.total + m.branches.total },
    functions: { covered: acc.functions.covered + m.functions.covered, total: acc.functions.total + m.functions.total },
  }),
  {
    lines: { covered: 0, total: 0 },
    statements: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
  },
);

const linePct = totals.lines.total ? totals.lines.covered / totals.lines.total : 0;
const stmtPct = totals.statements.total ? totals.statements.covered / totals.statements.total : 0;
const branchPct = totals.branches.total ? totals.branches.covered / totals.branches.total : 0;
const fnPct = totals.functions.total ? totals.functions.covered / totals.functions.total : 0;

const unitTestCount = UNIT_TESTS.reduce((n, t) => n + t.tests, 0);
const uiTestCount = 62 - unitTestCount; // synced with vitest output; re-count below

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║              ONLYKEY APP — TEST COVERAGE REPORT                  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log('Note: E2E (Playwright) was removed. UI/integration tests in Vitest');
console.log('      cover the same user flows in happy-dom + MockTransport.\n');

console.log('── Code coverage (src/) ──────────────────────────────────────────\n');
console.log(`  Lines      ${bar(linePct)}  ${pct(linePct)}  (${totals.lines.covered}/${totals.lines.total})`);
console.log(`  Statements ${bar(stmtPct)}  ${pct(stmtPct)}  (${totals.statements.covered}/${totals.statements.total})`);
console.log(`  Branches   ${bar(branchPct)}  ${pct(branchPct)}  (${totals.branches.covered}/${totals.branches.total})`);
console.log(`  Functions  ${bar(fnPct)}  ${pct(fnPct)}  (${totals.functions.covered}/${totals.functions.total})`);
console.log('\n  HTML report: coverage/index.html\n');

console.log('── Unit tests (logic / protocol) ─────────────────────────────────\n');
for (const t of UNIT_TESTS) {
  console.log(`  • ${t.area.padEnd(28)} ${String(t.tests).padStart(2)} tests  ${t.file}`);
}
console.log(`\n  Subtotal: ${unitTestCount} unit tests\n`);

console.log('── UI / integration tests (ex-E2E) ───────────────────────────────\n');
for (const t of UI_TESTS) {
  console.log(`  • ${t.area.padEnd(28)} ${t.file}`);
  console.log(`      ${t.features.join(' · ')}`);
}
console.log(`\n  Subtotal: ${UI_TESTS.length} UI test files\n`);

console.log('── Feature coverage matrix ─────────────────────────────────────────\n');
console.log('  Feature                          Unit                    UI / Integration');
console.log('  ─────────────────────────────────────────────────────────────────────────');
for (const row of FEATURE_MATRIX) {
  console.log(`  ${row.feature.padEnd(32)} ${row.unit.padEnd(23)} ${row.ui}`);
}

const untested = rows.filter((r) => r.lines.pct < 20 && !r.file.includes('__tests__'));
if (untested.length) {
  console.log('\n── Lowest line coverage (< 20%) ──────────────────────────────────\n');
  for (const r of untested.slice(0, 12)) {
    console.log(`  ${String(r.lines.pct).padStart(5)}%  ${r.file}`);
  }
}

console.log('\n── Commands ──────────────────────────────────────────────────────\n');
console.log('  npm run test:coverage   # code coverage only');
console.log('  npm run test:report     # this report');
console.log('  open coverage/index.html\n');