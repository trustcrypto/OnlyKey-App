export const RSA_SLOTS = [1, 2, 3, 4];
export const ECC_SLOTS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

export const KEY_SLOTS = {
  rsa: RSA_SLOTS,
  ecc: ECC_SLOTS,
  backup: 131,
  backupType: 161,
};

export function isOpenPgpKey(pem: string): boolean {
  return pem.includes('-----BEGIN PGP');
}

export function isSshKey(pem: string): boolean {
  return pem.includes('-----') && !pem.includes('-----BEGIN PGP');
}