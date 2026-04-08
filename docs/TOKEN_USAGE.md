# Token Usage Audit

This repository is prompt-heavy by design. The highest token consumers are system/mode prompt files used in each workflow.

## Biggest files (approx tokens, chars/4 heuristic)

Measured with `node token-audit.mjs`.

- `templates/portals.example.yml` ~6032 tokens
- `README.md` ~3817 tokens
- `CLAUDE.md` ~3553 tokens
- `batch/batch-prompt.md` ~3386 tokens
- `modes/de/_shared.md` ~3294 tokens
- `modes/scan.md` ~1796 tokens
- `modes/_shared.md` ~1540 tokens
- `modes/oferta.md` ~1305 tokens
- `modes/pdf.md` ~1116 tokens

## Workflow footprint (estimated)

- Single offer evaluation (`CLAUDE.md + _shared + oferta + cv + digest`) ~7411 tokens
- Single offer evaluation + PDF mode ~8527 tokens
- Batch worker core (`batch-prompt + cv + digest`) ~4399 tokens

## Where token usage is excessive

1. `batch/batch-prompt.md` is a full self-contained prompt and carries all rules into every worker call.
2. `CLAUDE.md` + `modes/_shared.md` duplicate guidance concepts (workflow rules, scoring language, tracker rules).
3. Optional context files (`article-digest.md`, `llms.txt`) are listed as always-load in some paths, even when not necessary for an obvious reject/accept.

## Recommended change for lower token usage

### Priority recommendation: introduce a **two-pass evaluation gate**

Use a short pass first, and only escalate to full context when needed.

1. **Pass 1 (cheap):**
   - Inputs: JD + minimal rubric (must-have filters + compensation/location constraints)
   - Output: `reject`, `accept`, or `uncertain`
2. **Pass 2 (full):**
   - Trigger only for `uncertain`
   - Inputs: current full prompt stack (profile, digest, negotiation, full scoring A-F)

Expected impact:
- Reduces average tokens per offer substantially in high-volume batches (many offers are obvious rejects).
- Preserves quality by keeping full analysis only for borderline opportunities.

## Low-risk follow-ups

- Create `batch/batch-prompt-lite.md` for pass 1.
- Keep `batch/batch-prompt.md` for pass 2.
- Load `article-digest.md` and `llms.txt` only when pass 1 returns `uncertain`.
- Move duplicate “global rules” into one canonical shared file and reference it from other prompts.