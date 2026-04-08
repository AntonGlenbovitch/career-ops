#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const SCAN_DIRS = ['.', 'modes', 'batch', 'docs', 'config'];
const ALLOWED_EXT = new Set(['.md', '.yml']);
const IGNORE_DIRS = new Set(['.git', 'node_modules']);

const CONTEXT_SCENARIOS = {
  single_offer_eval: ['CLAUDE.md', 'modes/_shared.md', 'modes/oferta.md', 'cv.md', 'article-digest.md'],
  single_offer_eval_plus_pdf: ['CLAUDE.md', 'modes/_shared.md', 'modes/oferta.md', 'modes/pdf.md', 'cv.md', 'article-digest.md'],
  batch_worker: ['batch/batch-prompt.md', 'cv.md', 'article-digest.md', 'llms.txt'],
};

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

  const missingText = missing.length ? ` | missing: ${missing.join(', ')}` : '';
  console.log(`- ${name}: ~${total} tokens${missingText}`);
}

console.log('\nQuick wins:');
console.log('- Keep shared prompts lean: avoid repeating rubric text across mode files.');
console.log('- Add a condensed batch prompt variant for high-volume runs.');
console.log('- Only load optional files (e.g. llms.txt, article-digest.md) when score uncertainty is high.');