import { readData, writeData } from "@/lib/db"
import type { SourceScript } from "@/types/source"
import type { SourceProbeResult } from "./probe"

const STORE_FILE = "sources.json"
const PROBE_FILE = "sourceProbe.json"

export async function loadSourceScripts(): Promise<SourceScript[]> {
  return readData<SourceScript[]>(STORE_FILE, [])
}

export function saveSourceScripts(scripts: SourceScript[]): void {
  writeData(STORE_FILE, scripts)
}

export async function loadSourceProbeResults(): Promise<
  Record<string, SourceProbeResult>
> {
  const raw = await readData<unknown>(PROBE_FILE, {})
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, SourceProbeResult> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const platforms = (value as { platforms?: unknown }).platforms
    if (!platforms || typeof platforms !== "object" || Array.isArray(platforms)) {
      continue
    }
    const cleaned: Record<string, boolean> = {}
    for (const [platform, ok] of Object.entries(
      platforms as Record<string, unknown>,
    )) {
      if (typeof ok === "boolean") cleaned[platform] = ok
    }
    if (Object.keys(cleaned).length) out[id] = { platforms: cleaned }
  }
  return out
}

export function saveSourceProbeResults(
  results: Record<string, SourceProbeResult>,
): void {
  writeData(PROBE_FILE, results)
}
