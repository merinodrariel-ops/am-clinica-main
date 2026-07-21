---
name: am-verification-loop
description: Verification workflow for am-clinica-main. Use before claiming a clinic code change is complete, deployed, email/WhatsApp-tested, production-visible, or safe to send; applies to build, lint, tests, Supabase-sensitive changes, Vercel deployment, and live route checks.
---

# AM Verification Loop

Use evidence before completion claims.

## Local Checks

Pick the smallest meaningful set, then expand if risk is higher:

```bash
npm run build
npm run lint
npx eslint <touched-file>
npm test
```

If a command is unavailable or too broad for the task, say exactly what you ran instead.

## Focused Checks

- Agenda/date work: test or inspect Argentina-local day/week/month/year boundaries.
- Agenda data work: before commit/push, run the exact query/action shape used by the UI for the affected date range against the target Supabase environment, and confirm it returns no error and expected rows when production data exists. A build or unauthenticated redirect check is not enough.
- Supabase work: inspect RLS/auth assumptions, query filters, and sensitive fields.
- Email work: verify Resend/template/action path and, when requested, send a real test.
- Portal work: verify `/portal`, `/portal/agenda`, and `/portal/liquidation` paths as applicable, plus the effective role/override data that controls navigation or access.
- UI work: verify the route in browser when a dev server or production URL is available.

## Pre-Push Gate

For production-visible changes, do not commit/push until:

1. The focused functional check for the touched workflow has passed.
2. A local build or focused type/lint check has passed.
3. Any broad suite failures have been classified as related or unrelated with evidence.

## Production Checks

When the user expects the online app:

1. Push/deploy only scoped changes.
2. Wait for Vercel or the relevant host to report ready.
3. Verify the actual production URL or expected redirect.
4. Report production status separately from local verification.

## Completion Report

Use:

```text
Local verification:
Production verification:
Changed files:
Residual risk:
```
