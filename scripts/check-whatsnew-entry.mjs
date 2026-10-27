// Verifies the release notes entry for the version being shipped: it exists,
// is bilingual, and has content in both languages.
//
//   node scripts/check-whatsnew-entry.mjs          (defaults to package.json)
//   node scripts/check-whatsnew-entry.mjs 3.10.0
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createRequire } from "node:module"

const root = resolve(import.meta.dirname, "..")
// Default to the version in package.json, so this runs as part of the suite
// without arguments and always checks the release actually being shipped.
const version = (
  process.argv[2] || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version
)
  .toString()
  .replace(/^v/, "")
if (!version) {
  console.error("usage: node scripts/check-whatsnew-entry.mjs <version>")
  process.exit(2)
}

const require = createRequire(join(root, "package.json"))
function esbuildEntry() {
  try {
    return require.resolve("esbuild/lib/main.js", { paths: [root] })
  } catch {}
  const dir = readdirSync(join(root, "node_modules", ".pnpm")).find((d) =>
    d.startsWith("esbuild@"),
  )
  if (!dir) throw new Error("esbuild not found; run pnpm install")
  return join(root, "node_modules", ".pnpm", dir, "node_modules", "esbuild", "lib", "main.js")
}

const outDir = mkdtempSync(join(tmpdir(), "museek-whatsnew-"))
const outFile = join(outDir, "entries.mjs")

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(52)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}

try {
  const esbuild = require(esbuildEntry())
  await esbuild.build({
    entryPoints: [join(root, "src", "lib", "whatsNew", "entries.ts")],
    outfile: outFile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    alias: { "@": join(root, "src") },
    logLevel: "error",
  })
  const { getWhatsNew } = await import(pathToFileURL(outFile).href)

  console.log(`Release notes for ${version}`)
  const zh = getWhatsNew(version, "zh")
  const en = getWhatsNew(version, "en")

  check("a zh note exists", Boolean(zh), true)
  check("an en note exists", Boolean(en), true)

  const zhBullets = (zh?.sections ?? []).flatMap((s) => s.bullets)
  const enBullets = (en?.sections ?? []).flatMap((s) => s.bullets)
  check("zh has sections", (zh?.sections ?? []).length > 0, true)
  check("en has sections", (en?.sections ?? []).length > 0, true)
  check("both languages have the same section count", zh?.sections.length, en?.sections.length)
  check("both languages have the same bullet count", zhBullets.length, enBullets.length)
  check("no empty zh bullets", zhBullets.every((b) => b.trim().length > 0), true)
  check("no empty en bullets", enBullets.every((b) => b.trim().length > 0), true)
  check("no empty zh section titles", (zh?.sections ?? []).every((s) => s.title.trim().length > 0), true)
  check("no empty en section titles", (en?.sections ?? []).every((s) => s.title.trim().length > 0), true)

  console.log(`\n  ${zh?.sections.length} sections, ${zhBullets.length} bullets per language`)
  for (const s of zh?.sections ?? []) console.log(`    ${s.title}`)

  console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
}
