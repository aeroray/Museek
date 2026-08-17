import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DesktopLyricsApp } from "@/components/lyrics/DesktopLyricsApp";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initTheme } from "@/stores/themeStore";
import { initFonts } from "@/stores/fontStore";
import { installLockdown } from "@/lib/lockdown";
import "./index.css";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
let isDesktopLyricsWindow = false;
if (isTauri) {
  try {
    isDesktopLyricsWindow = getCurrentWindow().label === "lyrics";
  } catch {
    /* Fall back to the main application if the Tauri bridge is not ready. */
  }
}

// Apply saved theme before first paint to avoid a flash of the wrong theme.
initTheme(!isDesktopLyricsWindow);
initFonts(!isDesktopLyricsWindow);
// Disable right-click everywhere (and devtools shortcuts in production).
installLockdown();

async function bootstrap() {
  const Root = isDesktopLyricsWindow
    ? () => (
        <TooltipProvider delayDuration={350}>
          <DesktopLyricsApp />
        </TooltipProvider>
      )
    : (await import("./App")).default;
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}

void bootstrap();
