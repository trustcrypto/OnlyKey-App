import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSshpk, resetSshpkCache } from '../sshpkNode';

describe('loadSshpk', () => {
  afterEach(() => {
    resetSshpkCache();
    const g = globalThis as typeof globalThis & { require?: NodeRequire };
    delete g.require;
  });

  it('throws when Node require is unavailable', () => {
    resetSshpkCache();
    const g = globalThis as typeof globalThis & { require?: NodeRequire };
    delete g.require;
    expect(() => loadSshpk()).toThrow(/sshpk requires NW\.js Node integration/);
  });

  it('loads sshpk through require and caches it', () => {
    resetSshpkCache();
    const fake = { parsePrivateKey: vi.fn() };
    (globalThis as typeof globalThis & { require?: NodeRequire }).require = (() =>
      fake) as unknown as NodeRequire;
    expect(loadSshpk()).toBe(fake);
    expect(loadSshpk()).toBe(fake);
  });
});
