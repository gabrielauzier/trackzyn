#!/usr/bin/env node
// Reads a vitest JSON report and exits non-zero unless the run is clean.
//   node scripts/summary.mjs <report.json> [--no-skip]
import { readFileSync } from 'node:fs'

const [file, ...flags] = process.argv.slice(2)
if (!file) {
  console.error('usage: summary.mjs <report.json> [--no-skip]')
  process.exit(2)
}
const report = JSON.parse(readFileSync(file, 'utf8'))
const failed = report.numFailedTests
const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0)
const total = report.numTotalTests
console.log(`total=${total} passed=${report.numPassedTests} failed=${failed} skipped=${skipped}`)

let ok = total > 0 && failed === 0 && report.numFailedTestSuites === 0
if (flags.includes('--no-skip') && skipped !== 0) ok = false
if (total === 0) console.error('the report has no tests')
process.exit(ok ? 0 : 1)
