declare module 'sshpk' {
  interface ParseOptions {
    passphrase?: string;
  }

  interface Key {
    type: string;
    curve?: string;
    part: Record<string, { data: Uint8Array } | undefined>;
    toBuffer(format: string): Buffer;
  }

  export function parsePrivateKey(data: string, format: string, options?: ParseOptions): Key;
}