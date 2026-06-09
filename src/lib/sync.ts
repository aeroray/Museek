import { gatherConfig, isValidConfig, type MuseekConfig } from "@/lib/configIO"

// Folder-based cross-device sync. We write the full app config as a passphrase-
// encrypted blob into a user-chosen folder; if that folder is one their cloud
// client already syncs (Baidu Netdisk / OneDrive / iCloud Drive / Dropbox …),
// the file rides along to their other devices. Everything is end-to-end
// encrypted with a passphrase the user picks — the cloud provider (and we) only
// ever see ciphertext. No account, no server, no provider API.
//
// Crypto: PBKDF2(SHA-256) → AES-256-GCM via the Web Crypto API (available in the
// Tauri webview, a secure context). A wrong passphrase fails GCM authentication
// and surfaces as a clear "wrong passphrase" error.

export const SYNC_FILE_NAME = "museek-config.enc.json"
const PBKDF2_ITER = 210000

interface SyncEnvelope {
  app: "museek-sync"
  v: 1
  kdf: "PBKDF2"
  hash: "SHA-256"
  iter: number
  salt: string // base64
  iv: string // base64
  ct: string // base64 (AES-GCM ciphertext incl. auth tag)
}

function b64FromBytes(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

/** Encrypt the current app config into a passphrase-protected envelope (JSON text). */
export async function encryptConfig(passphrase: string): Promise<string> {
  const json = JSON.stringify(await gatherConfig())
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, PBKDF2_ITER)
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(json),
  )
  const env: SyncEnvelope = {
    app: "museek-sync",
    v: 1,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter: PBKDF2_ITER,
    salt: b64FromBytes(salt),
    iv: b64FromBytes(iv),
    ct: b64FromBytes(new Uint8Array(ct)),
  }
  return JSON.stringify(env, null, 2)
}

export class WrongPassphraseError extends Error {}

/** Decrypt an envelope back into a validated config. Throws WrongPassphraseError
 *  on a bad passphrase / tampered file, or a generic Error if it isn't a sync file. */
export async function decryptConfig(blob: string, passphrase: string): Promise<MuseekConfig> {
  let env: SyncEnvelope
  try {
    env = JSON.parse(blob)
  } catch {
    throw new Error("not-a-sync-file")
  }
  if (!env || env.app !== "museek-sync" || !env.ct || !env.salt || !env.iv) {
    throw new Error("not-a-sync-file")
  }
  const key = await deriveKey(passphrase, bytesFromB64(env.salt), env.iter || PBKDF2_ITER)
  let ptBuf: ArrayBuffer
  try {
    ptBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesFromB64(env.iv) },
      key,
      bytesFromB64(env.ct),
    )
  } catch {
    throw new WrongPassphraseError("wrong passphrase or corrupted file")
  }
  const parsed = JSON.parse(new TextDecoder().decode(ptBuf))
  if (!isValidConfig(parsed)) throw new Error("invalid-config")
  return parsed
}

function joinPath(folder: string): string {
  return `${folder.replace(/[/\\]+$/, "")}/${SYNC_FILE_NAME}`
}

/** Write the encrypted blob into the sync folder. */
export async function writeSyncFile(folder: string, blob: string): Promise<void> {
  const { writeTextFile } = await import("@tauri-apps/plugin-fs")
  await writeTextFile(joinPath(folder), blob)
}

/** Read the encrypted blob from the sync folder, or null if there isn't one yet. */
export async function readSyncFile(folder: string): Promise<string | null> {
  const { readTextFile, exists } = await import("@tauri-apps/plugin-fs")
  const path = joinPath(folder)
  if (!(await exists(path))) return null
  return readTextFile(path)
}
