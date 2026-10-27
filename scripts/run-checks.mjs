// Runs every check-*.mjs in scripts/ and reports a summary.
//
// Each check is a standalone script that exits 0 on success, so this only has to
// spawn them in turn and collect results. They are deliberately independent:
// one failing check must not stop the others from running.
//
//   node scripts/run-checks.mjs            # all
//   node scripts/run-checks.mjs pagination # only names containing "pagination"
import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const scriptsDir = join(root, "scripts")

const filter = process.argv[2]?.toLowerCase()
const checks = readdirSync(scriptsDir)
  .filter((f) => f.startsWith("check-") && f.endsWith(".mjs"))
  .filter((f) => !filter || f.toLowerCase().includes(filter))
  .sort()

if (!checks.length) {
  console.error(filter ? `No checks match "${filter}"` : "No checks found")
  process.exit(1)
}

const started = Date.now()
const failed = []
const passed = []
const skipped = []

for (const name of checks) {
  const t0 = Date.now()
  process.stdout.write(`  ${name.padEnd(38)}`)
  const res = spawnSync(process.execPath, [join(scriptsDir, name)], {
    cwd: root,
    encoding: "utf8",
  })
  const ms = Date.now() - t0
  if (res.status === 0) {
    passed.push(name)
    console.log(`ok   ${String(ms).padStart(6)}ms`)
  } else if (res.status === 2) {
    // Exit code 2 is the checks' convention for "this environment cannot run
    // me" (e.g. a headless-browser check on a machine with no Chrome). That is
    // not a regression, so it must not fail the run — but it is reported, so a
    // silently-skipped check is never mistaken for a passing one.
    skipped.push({ name, why: (res.stderr ?? "").trim().split("\n").pop() })
    console.log(`SKIP ${String(ms).padStart(6)}ms`)
  } else {
    failed.push({ name, out: (res.stdout ?? "") + (res.stderr ?? "") })
    console.log(`FAIL ${String(ms).padStart(6)}ms`)
  }
}

const total = Date.now() - started
console.log("")
const parts = [`${passed.length}/${checks.length} passed`]
if (skipped.length) parts.push(`${skipped.length} skipped`)
if (failed.length) parts.push(`${failed.length} failed`)
console.log(`${parts.join(", ")} in ${(total / 1000).toFixed(1)}s`)

if (skipped.length) {
  console.log("")
  for (const { name, why } of skipped) {
    console.log(`  skipped ${name}: ${why || "environment cannot run it"}`)
  }
}

if (failed.length) {
  console.log("")
  for (const { name, out } of failed) {
    console.log(`--- ${name} ---`)
    const lines = out.trim().split("\n")
    console.log(lines.slice(-25).join("\n"))
    console.log("")
  }
  process.exit(1)
}
