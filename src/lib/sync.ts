import { applyConfig, gatherConfig, isValidConfig, type MuseekConfig } from "@/lib/configIO"
import { readData, writeData } from "@/lib/db"
import { useSettingsStore } from "@/stores/settingsStore"

// Folder-based cross-device sync. We write the full app config as an encrypted
// blob into a user-chosen folder; if that folder is one their cloud client
// already syncs (Baidu Netdisk / OneDrive / iCloud Drive / Dropbox …), the file
// rides along to their other devices. No account, no server, no provider API.
//
// The key is BUILT IN (see DEFAULT_PASSPHRASE below), so this is obfuscation,
// not secrecy against anyone who can read the file and the app's source: its
// real protection is the access control on the user's own cloud folder. Do not
// describe it as end-to-end encryption. A future user-passphrase flow can swap
// the key without changing the envelope.
//
// Crypto: PBKDF2(SHA-256) → AES-256-GCM via the Web Crypto API (a secure context
// in the Tauri webview). A wrong passphrase fails GCM auth → WrongPassphraseError.

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export const SYNC_FILE_NAME = "museek-config.enc.json"
const PBKDF2_ITER = 210000
/** Envelope iter is file-controlled — never let a crafted file make startup burn CPU. */
const MAX_PBKDF2_ITER = 1_000_000

// Built-in key so sync needs zero user input — you only pick a folder. The file
// is encrypted (never plaintext in the cloud), but since the key ships in the app
// this is obfuscation rather than true secrecy; real privacy comes from your own
// cloud account's access control over that folder.
const DEFAULT_PASSPHRASE = "Museek::folder-sync::v1$built-in-key"

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

async function encryptConfigObject(config: MuseekConfig, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, PBKDF2_ITER)
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(config)),
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
  const iter = env.iter || PBKDF2_ITER
  if (!Number.isInteger(iter) || iter < 1 || iter > MAX_PBKDF2_ITER) {
    throw new Error("invalid-config")
  }
  const salt = bytesFromB64(env.salt)
  const iv = bytesFromB64(env.iv)
  if (salt.length < 8 || salt.length > 64 || iv.length < 8 || iv.length > 32) {
    throw new Error("invalid-config")
  }
  const key = await deriveKey(passphrase, salt, iter)
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

/** A sync folder is set → automatic sync can run (the key is built in). */
export function isSyncConfigured(): boolean {
  return !!useSettingsStore.getState().syncFolder
}

// Record the timestamp of the config this device now holds. Direct settings.json
// write (read-modify-write) so it survives a subsequent reload; mirror it into the
// live store so any later store.persist() stays consistent.
async function markSynced(exportedAt: string): Promise<void> {
  const settings = (await readData<Record<string, unknown>>("settings.json", {})) ?? {}
  settings.syncLastAt = exportedAt
  await writeData("settings.json", settings)
  useSettingsStore.setState({ syncLastAt: exportedAt })
}

/** Apply an imported/restored config, mark it as our synced baseline, then reload
 *  so every store re-initializes from it. */
export async function applyConfigAndReload(config: MuseekConfig): Promise<void> {
  await applyConfig(config)
  // Never let a file pin the sync baseline to a future date: every later
  // legitimate export would compare "older" and silently stop syncing.
  const t = Date.parse(config.exportedAt)
  const safeAt =
    Number.isFinite(t) && t <= Date.now() + 7 * 24 * 3600_000
      ? config.exportedAt
      : new Date().toISOString()
  await markSynced(safeAt)
  location.reload()
}

/**
 * Sources a silent auto-import brings that this device does not already run —
 * new ids, or a known id whose script text changed — arrive DISABLED. Enabled
 * source scripts execute at startup, so a replaced sync file must not be able
 * to run new code without the user turning it on in Settings → Sources.
 * Manual imports keep their state: those go through a confirmation dialog.
 */
async function disableUntrustedSources(config: MuseekConfig): Promise<void> {
  const incoming = config.data["sources.json"]
  if (!Array.isArray(incoming)) return
  const current = await readData<Array<{ id?: unknown; rawScript?: unknown }>>(
    "sources.json",
    [],
  )
  const known = new Map(
    (Array.isArray(current) ? current : []).map((s) => [s?.id, s?.rawScript]),
  )
  config.data["sources.json"] = incoming.map((s) => {
    if (!s || typeof s !== "object") return s
    const script = s as { id?: unknown; rawScript?: unknown; enabled?: unknown }
    const trusted =
      typeof script.id === "string" &&
      known.has(script.id) &&
      known.get(script.id) === script.rawScript
    return trusted ? s : { ...script, enabled: false }
  })
}

/** Encrypt the current config and write it to the sync folder (advancing the
 *  synced-baseline timestamp). Throws if no sync folder is set. */
export async function backupToFolder(): Promise<void> {
  const { syncFolder } = useSettingsStore.getState()
  if (!syncFolder) throw new Error("not-configured")
  const config = await gatherConfig()
  const blob = await encryptConfigObject(config, DEFAULT_PASSPHRASE)
  await writeSyncFile(syncFolder, blob)
  await markSynced(config.exportedAt)
}

/** Read + decrypt the sync folder's backup for a manual restore (null if none). */
export async function restoreFromFolder(): Promise<MuseekConfig | null> {
  const { syncFolder } = useSettingsStore.getState()
  if (!syncFolder) return null
  const blob = await readSyncFile(syncFolder)
  if (!blob) return null
  return decryptConfig(blob, DEFAULT_PASSPHRASE)
}

/** On startup: if the sync folder holds a config strictly newer than what this
 *  device last synced, silently import it and reload. Returns true if a reload
 *  was triggered (caller should stop further init). Fully silent — any failure
 *  (no file, wrong stored passphrase, read error) just skips. Reads settings.json
 *  directly so it can run before the settings store has loaded. */
export async function maybeAutoImport(): Promise<boolean> {
  if (!isTauri) return false
  try {
    const s = (await readData<Record<string, unknown>>("settings.json", {})) ?? {}
    const folder = typeof s.syncFolder === "string" ? s.syncFolder : null
    const lastAt = typeof s.syncLastAt === "string" ? s.syncLastAt : null
    if (!folder) return false
    const blob = await readSyncFile(folder)
    if (!blob) return false
    const config = await decryptConfig(blob, DEFAULT_PASSPHRASE)
    // A far-future exportedAt would win every comparison forever — reject it
    // instead of importing (and re-importing on every launch).
    const exportedMs = Date.parse(config.exportedAt)
    if (!Number.isFinite(exportedMs) || exportedMs > Date.now() + 7 * 24 * 3600_000)
      return false
    // Only import when the cloud copy is strictly newer than our last sync — this
    // prevents a reload loop and avoids reverting newer local data.
    if (lastAt && config.exportedAt <= lastAt) return false
    await disableUntrustedSources(config)
    await applyConfigAndReload(config)
    return true
  } catch {
    return false
  }
}
