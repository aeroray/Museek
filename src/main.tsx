import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initTheme } from "@/stores/themeStore"
import { installLockdown } from "@/lib/lockdown"
import "./fonts.css"
import "./index.css"

// Apply saved theme before first paint to avoid a flash of the wrong theme.
initTheme()
// Disable right-click everywhere (and devtools shortcuts in production).
installLockdown()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
