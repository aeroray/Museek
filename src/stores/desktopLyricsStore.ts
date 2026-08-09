import { create } from "zustand";
import type { DesktopLyricsInteractionMode } from "@/lib/desktopLyricsProtocol";

interface DesktopLyricsState {
  interactionMode: DesktopLyricsInteractionMode;
  isVisible: boolean;
  setInteractionMode: (mode: DesktopLyricsInteractionMode) => void;
  setVisible: (visible: boolean) => void;
}

export const useDesktopLyricsStore = create<DesktopLyricsState>((set) => ({
  interactionMode: "interactive",
  isVisible: false,
  setInteractionMode: (interactionMode) => set({ interactionMode }),
  setVisible: (isVisible) => set({ isVisible }),
}));
