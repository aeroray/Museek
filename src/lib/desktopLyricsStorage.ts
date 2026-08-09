import { readData, writeData } from "@/lib/db";
import type { DesktopLyricsInteractionMode } from "@/lib/desktopLyricsProtocol";

const INTERACTION_FILE = "desktopLyrics.json";
const GEOMETRY_FILE = "desktopLyricsGeometry.json";

interface PersistedDesktopLyrics {
  interactionMode?: DesktopLyricsInteractionMode | "click-through";
}

export interface DesktopLyricsGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  heightIncludesToolbar?: boolean;
}

export async function loadDesktopLyricsInteractionMode(): Promise<DesktopLyricsInteractionMode> {
  const data = await readData<Partial<PersistedDesktopLyrics>>(
    INTERACTION_FILE,
    {},
  );
  return data.interactionMode === "locked" ||
    data.interactionMode === "click-through"
    ? "locked"
    : "interactive";
}

export async function saveDesktopLyricsInteractionMode(
  interactionMode: DesktopLyricsInteractionMode,
): Promise<void> {
  await writeData(INTERACTION_FILE, { interactionMode });
}

export async function loadDesktopLyricsGeometry(): Promise<DesktopLyricsGeometry | null> {
  const data = await readData<Partial<DesktopLyricsGeometry>>(
    GEOMETRY_FILE,
    {},
  );
  if (
    !Number.isFinite(data.x) ||
    !Number.isFinite(data.y) ||
    !Number.isFinite(data.width) ||
    !Number.isFinite(data.height) ||
    (data.width ?? 0) <= 0 ||
    (data.height ?? 0) <= 0
  ) {
    return null;
  }
  return {
    x: Math.round(data.x as number),
    y: Math.round(data.y as number),
    width: data.width as number,
    height: data.height as number,
    heightIncludesToolbar: data.heightIncludesToolbar === true,
  };
}

export async function saveDesktopLyricsGeometry(
  geometry: DesktopLyricsGeometry,
): Promise<void> {
  await writeData(GEOMETRY_FILE, geometry);
}
