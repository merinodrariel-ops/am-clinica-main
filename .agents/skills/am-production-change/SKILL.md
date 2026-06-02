---
name: am-production-change
description: Production-visible change workflow for am-clinica-main. Use when the user asks to fix, add, send, deploy, verify, or show a change in the clinic app, especially agenda, caja, owner dashboards, portal, emails, WhatsApp, public conversion paths, or Vercel production behavior.
---

# AM Production Change

Use this as the default workflow for clinic changes that matter outside the local machine.

## Workflow

1. Establish the real target: local-only, production deploy, mailbox test, WhatsApp test, or public URL verification.
2. Inspect the current path before editing. Read routes, actions, components, Supabase helpers, scheduler/email code, and existing tests relevant to the request.
3. Check `git status --short`; preserve unrelated dirty files and stage only touched files.
4. Make the smallest coherent change that satisfies the user-visible goal.
5. Run targeted verification first, then broader verification when the blast radius is high.
6. If production is the target, deploy/push through the repo's existing workflow and verify the online result before claiming it is done.

## AM Defaults

- Treat online behavior as the default target unless the user says local-only.
- Do not ship unrelated worktree changes.
- Prefer plain Spanish UI labels for internal clinic surfaces.
- For conversion flows, direct WhatsApp is usually the default path when speed matters.
- For owner/caja metrics, preserve the user's existing KPI hierarchy unless the request explicitly changes it.

## Output

Report:

- what changed
- what was verified locally
- whether production was actually verified
- any remaining risk or manual follow-up
