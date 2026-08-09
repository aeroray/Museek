import * as pako from "pako";

const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38,
  30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1,
  59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39,
  31, 23, 15, 7,
];
const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14,
  54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28,
  35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9,
  49, 17, 57, 25,
];
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35,
  27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38,
  30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27,
  20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34,
  53, 46, 42, 50, 36, 29, 32,
];
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const SBOXES = [
  [
    [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7],
    [0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8],
    [4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0],
    [15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  ],
  [
    [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10],
    [3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5],
    [0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15],
    [13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  ],
  [
    [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8],
    [13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1],
    [13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7],
    [1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  ],
  [
    [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15],
    [13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9],
    [10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4],
    [3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  ],
  [
    [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9],
    [14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6],
    [4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14],
    [11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  ],
  [
    [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11],
    [10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8],
    [9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6],
    [4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  ],
  [
    [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1],
    [13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6],
    [1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2],
    [6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  ],
  [
    [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7],
    [1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2],
    [7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8],
    [2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
  ],
] as const;
const QRC_KEY = new Uint8Array([
  0x21, 0x40, 0x23, 0x29, 0x28, 0x2a, 0x24, 0x25, 0x31, 0x32, 0x33, 0x5a, 0x58,
  0x43, 0x21, 0x40, 0x21, 0x40, 0x23, 0x29, 0x28, 0x4e, 0x48, 0x4c,
]);

type Bit = 0 | 1;

function referenceBit(bytes: Uint8Array, position: number): Bit {
  const byte =
    Math.floor(position / 32) * 4 + 3 - Math.floor((position % 32) / 8);
  const shift = 7 - (position % 8);
  return ((bytes[byte] >>> shift) & 1) as Bit;
}

function bitnumIntr(value: number, position: number, target: number): number {
  return (((value >>> (31 - position)) & 1) << target) >>> 0;
}

function bitnumIntl(value: number, position: number, target: number): number {
  return (((((value << position) >>> 0) & 0x80000000) >>> 0) >>> target) >>> 0;
}

function createSubkeys(key: Uint8Array): Uint8Array[] {
  const schedule = Array.from({ length: 16 }, () => new Uint8Array(6));
  let left = 0;
  let right = 0;
  for (let index = 0; index < 28; index++) {
    left = (left | (referenceBit(key, PC1[index] - 1) << (31 - index))) >>> 0;
    right =
      (right | (referenceBit(key, PC1[index + 28] - 1) << (31 - index))) >>> 0;
  }

  for (let index = 0; index < SHIFTS.length; index++) {
    const shift = SHIFTS[index];
    left =
      ((((left << shift) >>> 0) | (left >>> (28 - shift))) & 0xfffffff0) >>> 0;
    right =
      ((((right << shift) >>> 0) | (right >>> (28 - shift))) & 0xfffffff0) >>>
      0;
    const target = index;
    for (let bit = 0; bit < 24; bit++) {
      schedule[target][Math.floor(bit / 8)] |= bitnumIntr(
        left,
        PC2[bit] - 1,
        7 - (bit % 8),
      );
      schedule[target][Math.floor((bit + 24) / 8)] |= bitnumIntr(
        right,
        PC2[bit + 24] - 28,
        7 - (bit % 8),
      );
    }
  }
  return schedule;
}

function initialPermutation(input: Uint8Array): [number, number] {
  let left = 0;
  let right = 0;
  for (let index = 0; index < 32; index++) {
    left = (left | (referenceBit(input, IP[index] - 1) << (31 - index))) >>> 0;
    right =
      (right | (referenceBit(input, IP[index + 32] - 1) << (31 - index))) >>> 0;
  }
  return [left, right];
}

function setReferenceBit(
  bytes: Uint8Array,
  position: number,
  value: Bit,
): void {
  const byte =
    Math.floor(position / 32) * 4 + 3 - Math.floor((position % 32) / 8);
  const shift = 7 - (position % 8);
  if (value) bytes[byte] |= 1 << shift;
}

function inversePermutation(left: number, right: number): Uint8Array {
  const state: Bit[] = [];
  for (let index = 0; index < 32; index++) {
    state.push(((left >>> (31 - index)) & 1) as Bit);
  }
  for (let index = 0; index < 32; index++) {
    state.push(((right >>> (31 - index)) & 1) as Bit);
  }

  const output = new Uint8Array(8);
  for (let index = 0; index < 64; index++) {
    setReferenceBit(output, index, state[FP[index] - 1]);
  }
  return output;
}

function sboxValue(box: number, value: number): number {
  const index = (value & 32) | ((value & 31) >>> 1) | ((value & 1) << 4);
  const row = index >>> 4;
  const column = index & 15;
  return SBOXES[box][row][column];
}

function desF(state: number, key: Uint8Array): number {
  const expandedLeft =
    (bitnumIntl(state, 31, 0) |
      ((state & 0xf0000000) >>> 1) |
      bitnumIntl(state, 4, 5) |
      bitnumIntl(state, 3, 6) |
      ((state & 0x0f000000) >>> 3) |
      bitnumIntl(state, 8, 11) |
      bitnumIntl(state, 7, 12) |
      ((state & 0x00f00000) >>> 5) |
      bitnumIntl(state, 12, 17) |
      bitnumIntl(state, 11, 18) |
      ((state & 0x000f0000) >>> 7) |
      bitnumIntl(state, 16, 23)) >>>
    0;
  const expandedRight =
    (bitnumIntl(state, 15, 0) |
      ((state & 0x0000f000) << 15) |
      bitnumIntl(state, 20, 5) |
      bitnumIntl(state, 19, 6) |
      ((state & 0x00000f00) << 13) |
      bitnumIntl(state, 24, 11) |
      bitnumIntl(state, 23, 12) |
      ((state & 0x000000f0) << 11) |
      bitnumIntl(state, 28, 17) |
      bitnumIntl(state, 27, 18) |
      ((state & 0x0000000f) << 9) |
      bitnumIntl(state, 0, 23)) >>>
    0;

  const bytes = [
    (expandedLeft >>> 24) & 0xff,
    (expandedLeft >>> 16) & 0xff,
    (expandedLeft >>> 8) & 0xff,
    (expandedRight >>> 24) & 0xff,
    (expandedRight >>> 16) & 0xff,
    (expandedRight >>> 8) & 0xff,
  ];
  for (let index = 0; index < 6; index++) bytes[index] ^= key[index];

  const substituted =
    (sboxValue(0, bytes[0] >>> 2) << 28) |
    (sboxValue(1, ((bytes[0] & 3) << 4) | (bytes[1] >>> 4)) << 24) |
    (sboxValue(2, ((bytes[1] & 15) << 2) | (bytes[2] >>> 6)) << 20) |
    (sboxValue(3, bytes[2] & 63) << 16) |
    (sboxValue(4, bytes[3] >>> 2) << 12) |
    (sboxValue(5, ((bytes[3] & 3) << 4) | (bytes[4] >>> 4)) << 8) |
    (sboxValue(6, ((bytes[4] & 15) << 2) | (bytes[5] >>> 6)) << 4) |
    sboxValue(7, bytes[5] & 63);

  const permutation = [
    15, 6, 19, 20, 28, 11, 27, 16, 0, 14, 22, 25, 4, 17, 30, 9, 1, 7, 23, 13,
    31, 26, 2, 8, 18, 12, 29, 5, 21, 10, 3, 24,
  ];
  let result = 0;
  for (let index = 0; index < permutation.length; index++) {
    result |= bitnumIntl(substituted, permutation[index], index);
  }
  return result >>> 0;
}

function desBlock(
  block: Uint8Array,
  key: Uint8Array,
  decrypt: boolean,
): Uint8Array {
  let [left, right] = initialPermutation(block);
  const schedule = createSubkeys(key);
  if (decrypt) schedule.reverse();
  for (let index = 0; index < 15; index++) {
    const previousRight = right;
    right = (desF(right, schedule[index]) ^ left) >>> 0;
    left = previousRight;
  }
  left = (desF(right, schedule[15]) ^ left) >>> 0;
  return inversePermutation(left, right);
}

function hexToBytes(value: string): Uint8Array | null {
  if (!value || value.length % 2 !== 0 || !/^[\da-f]+$/i.test(value))
    return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function decryptQrc(value: string): Uint8Array | null {
  const encrypted = hexToBytes(value);
  if (!encrypted || encrypted.length === 0 || encrypted.length % 8 !== 0)
    return null;

  const key1 = QRC_KEY.slice(0, 8);
  const key2 = QRC_KEY.slice(8, 16);
  const key3 = QRC_KEY.slice(16, 24);
  const decrypted = new Uint8Array(encrypted.length);
  for (let offset = 0; offset < encrypted.length; offset += 8) {
    const block = encrypted.slice(offset, offset + 8);
    const first = desBlock(block, key3, true);
    const second = desBlock(first, key2, false);
    decrypted.set(desBlock(second, key1, true), offset);
  }

  return decrypted;
}

/** Decode QQ Music's custom 3DES-ECB + zlib QRC lyric payload. */
export function decodeQrc(value: string): string {
  const decrypted = decryptQrc(value);
  if (!decrypted) return "";
  try {
    return new TextDecoder().decode(pako.inflate(decrypted));
  } catch {
    return "";
  }
}
