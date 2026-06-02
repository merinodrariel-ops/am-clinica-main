# AM Clinic Codex Pack

Use this project-local pack for `am-clinica-main` work.

## Operating Rules

- Treat the online app as the default target for user-facing fixes unless the user explicitly asks for local-only work.
- Preserve unrelated dirty worktree changes. Stage and commit only files touched for the requested task.
- Read the actual code path before proposing or editing. Do not infer agenda, caja, portal, email, or Supabase behavior from file names alone.
- For agenda date ranges, calculate boundaries in `America/Argentina/Buenos_Aires`.
- For conversion-facing public-site decisions, preserve the user's stated preference for direct WhatsApp paths unless there is a concrete reason not to.
- For clinic data, assume patient, appointment, worker, payment, and portal records are sensitive.

## Project Skills

Project-local skills live in `.agents/skills/`:

- `am-production-change`: production-visible implementation and deploy workflow.
- `am-product-capability`: capability contract before fuzzy multi-surface features.
- `am-verification-loop`: local and online verification before claiming completion.
- `am-agenda-rules`: agenda, portal, reminders, shared agenda, and Argentina-time invariants.
- `am-supabase-safety`: Supabase, auth, RLS, and sensitive data guardrails.

## Agent Roles

- `explorer`: read-only evidence gathering against code, database paths, routes, and deploy state.
- `reviewer`: read-only owner review for correctness, regressions, security, and missing tests.
- `docs_researcher`: read-only verification against primary docs for libraries and hosted services.
