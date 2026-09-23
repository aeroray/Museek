// Bundles the audio harness with the project's own esbuild, resolving the `@`
// alias the same way vite.config.ts does. Kept separate so the check script does
// not have to know where pnpm put esbuild.
import { createRequire } from "node:module"
import { readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..", "..")
const require = createRequire(import.meta.url)

/** Locate esbuild's JS entry across npm and pnpm layouts. */
function esbuildEntry() {
  try {
    return require.resolve("esbuild/lib/main.js", { paths: [root] })
  } catch {
    /* fall through to the pnpm scan */
  }
  const pnpm = join(root, "node_modules", ".pnpm")
  const dir = readdirSync(pnpm).find((d) => d.startsWith("esbuild@"))
  if (!dir) throw new Error("esbuild not found; run pnpm install")
  return join(pnpm, dir, "node_modules", "esbuild", "lib", "main.js")
}

const esbuild = require(esbuildEntry())

await esbuild.build({
  entryPoints: [join(import.meta.dirname, "main.ts")],
  bundle: true,
  format: "iife",
  outfile: join(import.meta.dirname, "bundle.js"),
  logLevel: "warning",
  alias: {
    "@": join(root, "src"),
    // The real http module needs the Tauri IPC bridge, which a plain browser
    // does not have. Swap in a plain-fetch shim so the rest of audio.ts (the
    // part under test) runs unmodified.
    "@/lib/http": join(import.meta.dirname, "httpShim.ts"),
  },
})
