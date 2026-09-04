import aesjs from "aes-js";
import forge from "node-forge";

/**
 * NetEase weapi signing (AES-128-CBC twice + RSA_NO_PADDING).
 * Ported from lx-music-desktop wy/utils/crypto.js.
 */

const IV = "0102030405060708";
const PRESET_KEY = "0CoJUm6Qyw8W8jud";
const BASE62 =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function aesCbcToBase64(text: string, key: string): string {
  const keyBytes = aesjs.utils.utf8.toBytes(key);
  const iv = aesjs.utils.utf8.toBytes(IV);
  const padded = aesjs.padding.pkcs7.pad(aesjs.utils.utf8.toBytes(text));
  const encrypted = new aesjs.ModeOfOperation.cbc(keyBytes, iv).encrypt(
    padded,
  );
  return bytesToBase64(
    encrypted instanceof Uint8Array ? encrypted : Uint8Array.from(encrypted),
  );
}

function randomSecretKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let key = "";
  for (let i = 0; i < 16; i++) key += BASE62.charAt(bytes[i] % 62);
  return key;
}

function rsaEncrypt(secretKey: string): string {
  const reversed = secretKey.split("").reverse().join("");
  const padded = "\0".repeat(128 - reversed.length) + reversed;
  const key = forge.pki.publicKeyFromPem(PUBLIC_KEY);
  return forge.util.bytesToHex(
    key.encrypt(padded, "NONE" as forge.pki.rsa.EncryptionScheme),
  );
}

/** Build `{ params, encSecKey }` form body for NetEase `/weapi/*` gateways. */
export function weapi(object: unknown): { params: string; encSecKey: string } {
  const secretKey = randomSecretKey();
  return {
    params: aesCbcToBase64(aesCbcToBase64(JSON.stringify(object), PRESET_KEY), secretKey),
    encSecKey: rsaEncrypt(secretKey),
  };
}
