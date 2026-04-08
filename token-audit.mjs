#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const SCAN_DIRS = ['.', 'modes', 'batch', 'docs', 'config'];
const ALLOWED_EXT = new Set(['.md', '.yml']);
const IGNORE_DIRS = new Set(['.git', 'node_modules']);

const CONTEXT_SCENARIOS = {
  single_offer_eval: ['CLAUDE.md', 'modes/_shared.md', 'modes/oferta.md', 'cv.md', 'article-digest.md'],
  single_offer_eval_plus_pdf: ['CLAUDE.md', 'modes/_shared.md', 'modes/oferta.md', 'modes/pdf.md', 'cv.md', 'article-digest.md'],
  batch_worker_full: ['batch/batch-prompt.md', 'modes/_shared.md', 'cv.md', 'article-digest.md', 'llms.txt'],
  batch_worker_lite: ['batch/batch-prompt-lite.md', 'cv.md'],
};

// Two-pass gate assumptions for estimating expected savings.
// Override via env vars if you have better measured values:
//   TOKEN_AUDIT_LITE_TOKENS=900 TOKEN_AUDIT_UNCERTAIN_RATE=0.35 node token-audit.mjs
const LITE_PASS_TOKENS = Number(process.env.TOKEN_AUDIT_LITE_TOKENS ?? 900);
const UNCERTAIN_RATE = Number(process.env.TOKEN_AUDIT_UNCERTAIN_RATE ?? 0.35);

const CHARS_PER_TOKEN = 4;
const estimateTokens = (text) => Math.round(text.length / CHARS_PER_TOKEN);

function walk(dir, seen, out) {
  if (!existsSync(dir) || seen.has(dir)) return;
  seen.add(dir);

  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, seen, out);
      continue;
    }
    const dot = name.lastIndexOf('.');
    const ext = dot === -1 ? '' : name.slice(dot);
    if (ALLOWED_EXT.has(ext)) {
      out.add(path.replace(/^\.\//, ''));
    }
  }
}

const files = new Set();
const seen = new Set();
for (const dir of SCAN_DIRS) walk(dir, seen, files);

const rows = [...files]
  .map((path) => {
    const text = readFileSync(path, 'utf8');
    return { path, chars: text.length, tokens: estimateTokens(text) };
  })
  .sort((a, b) => b.tokens - a.tokens);

console.log('Top token-heavy text files (est. chars/4):');
rows.slice(0, 20).forEach((row, idx) => {
  console.log(`${String(idx + 1).padStart(2, ' ')}. ${String(row.tokens).padStart(5, ' ')} tok | ${row.path}`);
});

const scenarioTotals = {};

console.log('\nEstimated context footprint by workflow:');
for (const [name, scenarioFiles] of Object.entries(CONTEXT_SCENARIOS)) {
  let total = 0;
  const missing = [];

  for (const file of scenarioFiles) {
    if (!existsSync(file)) {
      missing.push(file);
      continue;
    }
    total += estimateTokens(readFileSync(file, 'utf8'));
  }

  scenarioTotals[name] = total;
  const missingText = missing.length ? ` | missing: ${missing.join(', ')}` : '';
  console.log(`- ${name}: ~${total} tokens${missingText}`);
}

const baselineFullPass = scenarioTotals.batch_worker_full ?? 0;
const litePassTokens = scenarioTotals.batch_worker_lite ?? LITE_PASS_TOKENS;

if (baselineFullPass > 0) {
  const twoPassAvg = litePassTokens + (UNCERTAIN_RATE * baselineFullPass);
  const avgSavings = baselineFullPass - twoPassAvg;
  const pct = baselineFullPass > 0 ? (avgSavings / baselineFullPass) * 100 : 0;

  console.log('\nTwo-pass gate estimate (for batch workflow):');
  console.log(`- Full pass (detailed evaluation): ~${baselineFullPass.toFixed(0)} tokens/offer`);
  console.log(`- Lite pass (quick filter): ~${litePassTokens.toFixed(0)} tokens/offer`);
  console.log(`- Two-pass average: ~${twoPassAvg.toFixed(0)} tokens/offer (lite=${litePassTokens.toFixed(0)}, uncertain_rate=${UNCERTAIN_RATE})`);
  console.log(`- Estimated savings: ~${avgSavings.toFixed(0)} tokens/offer (${pct.toFixed(1)}% reduction)`);
  console.log(`\nFormula: (lite + uncertain_rate * full) = (${litePassTokens.toFixed(0)} + ${UNCERTAIN_RATE} * ${baselineFullPass.toFixed(0)}) = ${twoPassAvg.toFixed(0)}`);
}

console.log('\nQuick wins:');
console.log('- Keep shared prompts lean: avoid repeating rubric text across mode files.');
console.log('- Add a condensed batch prompt variant for high-volume runs.');
console.log('- Only load optional files (e.g. llms.txt, article-digest.md) when score uncertainty is high.');