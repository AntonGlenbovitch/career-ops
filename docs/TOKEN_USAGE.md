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

## Direct answer: how much this PR saves

The previous PR (audit tooling + docs only) saves **~0 tokens/offer** by itself, because it did not change runtime prompts.

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

### Expected average savings formula

- Baseline (today): `full_tokens`
- Two-pass average: `lite_tokens + uncertain_rate * full_tokens`
- Savings per offer: `full_tokens - (lite_tokens + uncertain_rate * full_tokens)`

Using current measured batch baseline `full_tokens = 4399` and example assumptions `lite_tokens = 900`:

- If uncertain rate = 25% → avg savings ≈ **2399 tokens/offer** (~54.5%)
- If uncertain rate = 35% → avg savings ≈ **1960 tokens/offer** (~44.6%)
- If uncertain rate = 50% → avg savings ≈ **1299 tokens/offer** (~29.5%)

`token-audit.mjs` now prints this estimate and supports overrides:

```bash
TOKEN_AUDIT_LITE_TOKENS=900 TOKEN_AUDIT_UNCERTAIN_RATE=0.35 node token-audit.mjs
```

## Low-risk follow-ups

- Create `batch/batch-prompt-lite.md` for pass 1.
- Keep `batch/batch-prompt.md` for pass 2.
- Load `article-digest.md` and `llms.txt` only when pass 1 returns `uncertain`.
- Move duplicate “global rules” into one canonical shared file and reference it from other prompts.