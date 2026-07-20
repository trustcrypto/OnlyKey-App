declare module 'sshpk' {
  interface ParseOptions {
    passphrase?: string;
  }

  interface Key {
    type: string;
    toBuffer(format: string): Buffer;
  }

  export function parsePrivateKey(data: string, format: string, options?: ParseOptions): Key;
}