import { invoke } from "@tauri-apps/api/core";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * One native metadata check for many absolute paths. Permission errors count
 * as present so we never false-flag a locked file. Browser preview: all present.
 */
export async function checkPathsExist(paths: string[]): Promise<boolean[]> {
  if (!paths.length) return [];
  if (!isTauri) return paths.map(() => true);
  try {
    const out = await invoke<boolean[]>("check_paths_exist", { paths });
    if (!Array.isArray(out) || out.length !== paths.length) {
      return paths.map(() => true);
    }
    return out;
  } catch {
    return paths.map(() => true);
  }
}
