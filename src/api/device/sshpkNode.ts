import type sshpk from 'sshpk';

type SshpkModule = typeof sshpk;

function getNodeRequire(): NodeRequire {
  const globalRequire = (globalThis as typeof globalThis & { require?: NodeRequire }).require;
  if (globalRequire) return globalRequire;
  throw new Error('sshpk requires NW.js Node integration (require is unavailable)');
}

let cached: SshpkModule | null = null;

/** Load sshpk from node_modules at runtime — do not bundle (needs real Node util/crypto). */
export function loadSshpk(): SshpkModule {
  if (!cached) {
    cached = getNodeRequire()('sshpk') as SshpkModule;
  }
  return cached;
}