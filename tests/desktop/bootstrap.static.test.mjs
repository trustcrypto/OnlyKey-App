import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('desktop bootstrap static checks', () => {
  it('index.html boots desktopBg from the main window', () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    expect(html).toContain("require(require('path').join(appRoot, 'desktopBg.cjs')).start()");
    expect(html).toContain('NW desktop bootstrap');
  });

  it('desktopInject.js also starts desktopBg as a secondary path', () => {
    const inject = fs.readFileSync(path.join(rootDir, 'desktopInject.js'), 'utf8');
    expect(inject).toContain('desktopBg.cjs');
    expect(inject).toContain('desktop.start');
  });

  it('package.json boots tray from inject_js_start (nw-tray-example pattern)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(pkg['bg-script']).toBeUndefined();
    expect(pkg.window?.inject_js_start).toBe('desktopInject.js');
    expect(pkg.devDependencies?.nw).toBe('0.104.1');
    expect(pkg.scripts?.['verify:tray']).toBe('node scripts/verify-tray.mjs');
    expect(fs.existsSync(path.join(rootDir, 'desktopBg.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'desktopBg.html'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'docs', 'desktop-tray.md'))).toBe(true);
    expect(fs.readFileSync(path.join(rootDir, 'desktopBg.cjs'), 'utf8')).toContain(
      'docs/desktop-tray.md'
    );
  });

  it('built dist/index.html preserves the NW desktop bootstrap', () => {
    const distIndex = path.join(rootDir, 'dist', 'index.html');
    expect(fs.existsSync(distIndex), 'dist/index.html missing — run npm run build').toBe(true);
    const html = fs.readFileSync(distIndex, 'utf8');
    expect(html).toContain("require(require('path').join(appRoot, 'desktopBg.cjs')).start()");
  });
});