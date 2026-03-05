# Agent Guardrails (am-clinica-main)

Use this checklist before any code change to avoid regressions in auth, RLS, and Supabase client usage.

## Mandatory Context

- Project memory file:
  - `/Users/am/.claude/projects/-Users-am-Downloads-antigravity-apps-am-clinica-main/memory/MEMORY.md`
- Live DB role column:
  - `profiles.categoria` (NOT `profiles.role`)

## Supabase Client Rules

- Browser/client components:
  - `import { createClient } from '@/utils/supabase/client'`
- Server Actions:
  - `import { createClient } from '@/utils/supabase/server'`
  - use admin only when cross-user access is required
- API routes/webhooks/cron:
  - `import { createAdminClient } from '@/utils/supabase/admin'`
- Never use:
  - `@/lib/supabase` in client components

## SQL and RLS Rules

- Never reference `profiles.role`
- Use `profiles.categoria` or `get_my_role()`
- If changing SQL functions/triggers/policies, verify body text explicitly

## Date Parsing Rule (Critical)

- Avoid `new Date('YYYY-MM-DD')` for local dates
- Parse date-only strings as local time:

```ts
const [y, m, d] = str.split('-').map(Number);
const localDate = new Date(y, m - 1, d);
```

## Anti-Regression Checklist

- [ ] Read project memory file before coding
- [ ] No new usage of `profiles.role`
- [ ] Correct Supabase client used for each runtime context
- [ ] Date-only parsing does not use UTC-shifted constructor
- [ ] Lint/tests run for touched files
- [ ] Validation evidence included in final summary

## Delivery Format (for agents)

1. Files changed
2. Risk found
3. Mitigation applied
4. Validation commands and results
