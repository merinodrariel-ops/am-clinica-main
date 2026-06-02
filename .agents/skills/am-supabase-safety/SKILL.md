---
name: am-supabase-safety
description: Supabase and sensitive-data safety workflow for am-clinica-main. Use when querying, editing, migrating, scripting, or reviewing Supabase tables, auth users, RLS policies, patient data, appointments, worker portal accounts, payments, financing, payroll, or any service-role operation.
---

# AM Supabase Safety

Treat clinic data as sensitive by default.

## Before Querying Or Editing

1. Identify the table, auth surface, and caller role.
2. Check whether the operation needs user-scoped client access or service-role access.
3. Avoid dumping full patient, payment, worker, or appointment records unless the user explicitly needs that data.
4. Prefer narrow selects and filters.
5. Keep `.env`, credentials, service-role keys, and generated secret-bearing files out of commits.

## Code Review Checks

- Validate input at API/action boundaries.
- Use parameterized Supabase/query-builder calls.
- Preserve RLS assumptions; do not bypass with service-role helpers in user-facing paths.
- Avoid logging patient data, auth tokens, reset links, payment details, or private emails.
- For scripts, make dry-run behavior explicit when mutations are possible.

## AM Auth And Portal Notes

- Existing doctor/prestador users usually need password reset flow, not a new invite.
- New portal onboarding should reuse existing worker portal actions where possible.
- Verify current user/account state before sending operator-facing instructions.

## Output

When Supabase was involved, report:

- data touched or inspected
- whether service-role access was used
- mutation vs read-only behavior
- privacy or RLS risk remaining
