export function hexToModhex(inputStr: string, reverse: boolean = false): string {
  const hex = "0123456789abcdef";
  const modhex = "cbdefghijklnrtuv";
  let newStr = "";
  const o = reverse ? modhex : hex;
  const t = reverse ? hex : modhex;
  inputStr.split("").forEach((c) => {
    const i = o.indexOf(c);
    if (i < 0) {
      throw new Error("Invalid character sent for hexToModhex conversion");
    }
    newStr += t.charAt(i);
  });
  return newStr;
}

export function arrayToHexString(byteArray: Uint8Array | number[]): string {
  return Array.from(byteArray, (byte) => {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('').toUpperCase();
}

export function hexStringToByteArray(hexString: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hexString.length; i += 2) {
    result.push(parseInt(hexString.substring(i, i + 2), 16));
  }
  return result;
}

export function strPad(str: string | number, places: number, char: string = '0'): string {
  let s = str.toString();
  while (s.length < places) {
    s = `${char}${s}`;
  }
  return s;
}

export function base64ToHex(base64: string): string {
  const raw = atob(base64);
  let HEX = "";
  for (let i = 0; i < raw.length; i++) {
    const _hex = raw.charCodeAt(i).toString(16);
    HEX += _hex.length === 2 ? _hex : "0" + _hex;
  }
  return HEX.toUpperCase();
}

export function parseBackupData(contents: string): string {
  const newContents: string[] = [];
  contents.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("--")) {
      newContents.push(base64ToHex(trimmed));
    }
  });
  return newContents.join("");
}

export function parseFirmwareData(contents: string): string[] {
  const lines = contents.split("\n");
  // Remove header if present
  if (lines[0].includes("BEGIN SIGNED FIRMWARE")) {
    lines.shift();
  }
  return lines.map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("--"));
}
