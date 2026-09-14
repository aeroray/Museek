import { invoke } from "@tauri-apps/api/core";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Add paths to the plugin-fs runtime ACL.
 * Picking a `.cue` only grants that sheet; the referenced FLAC still needs this
 * or later readFile/识曲 surfaces as a fake permission error.
 */
export async function allowLocalFilePaths(paths: string[]): Promise<void> {
  if (!isTauri) return;
  const unique = [
    ...new Set(paths.filter((path) => typeof path === "string" && path)),
  ];
  if (!unique.length) return;
  try {
    await invoke("allow_local_file_paths", { paths: unique });
  } catch {
    /* command missing in browser preview */
  }
}
