// Bundles project `.ts` modules so a plain `node` can import them.
//
// Most check scripts in this folder already do this inline. The reason is
// portability: importing a `.ts` file directly only works on Node builds with
// type stripping enabled (23+, or 22 with --experimental-strip-types), so a
// harness written that way silently fails on an older interpreter — which is
// exactly what happened when the toolchain was pinned to Node 22. Bundling with
// the project's own esbuild removes that coupling and matches how the app is
// actually built.
//
// Usage:
//   import { createTsLoader } from "./lib/load-ts.mjs"
//   const load = createTsLoader()
//   const { qualityMeets } = await load("src/lib/quality.ts")
//
// Each module is bundled once and cached, so a later `load()` of the same path
// returns the same instance (a script that re-imports mid-run keeps state).
import { createRequire } from "node:module"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const root = resolve(import.meta.dirname, "..", "..")
const require = createRequire(join(root, "package.json"))

function esbuildEntry() {
  try {
    return require.resolve("esbuild/lib/main.js", { paths: [root] })
  } catch {}
  const pnpm = join(root, "node_modules", ".pnpm")
  let dir
  try {
    dir = readdirSync(pnpm).find((d) => d.startsWith("esbuild@"))
  } catch {
    throw new Error(`cannot find esbuild; run pnpm install in ${root}`)
  }
  if (!dir) throw new Error(`cannot find esbuild in ${pnpm}; run pnpm install`)
  return join(pnpm, dir, "node_modules", "esbuild", "lib", "main.js")
}

/**
 * @returns {(relPath: string) => Promise<Record<string, unknown>>}
 */
export function createTsLoader() {
  const cache = new Map()
  let workDir = null
  let counter = 0

  const cleanup = () => {
    if (!workDir) return
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch {
      // best effort: a locked temp file must not fail the check itself
    }
    workDir = null
  }
  process.once("exit", cleanup)

  return async function load(relPath) {
    const abs = join(root, relPath)
    const cached = cache.get(abs)
    if (cached) return cached

    if (!workDir) workDir = mkdtempSync(join(tmpdir(), "museek-ts-"))
    const outfile = join(workDir, `mod-${counter++}.mjs`)

    const esbuild = await import(pathToFileURL(esbuildEntry()).href)
    await esbuild.build({
      entryPoints: [abs],
      outfile,
      bundle: true,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      logLevel: "silent",
      alias: { "@": join(root, "src") },
      define: { "process.env.NODE_ENV": '"production"' },
    })

    const mod = await import(pathToFileURL(outfile).href)
    cache.set(abs, mod)
    return mod
  }
}
