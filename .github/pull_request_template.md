## Summary

- What changed?
- Why this change?

## Routing & Contract

- [ ] I selected the right task route from `docs/AGENT_ROUTING.md`
- [ ] I used `docs/TASK_CONTRACT.md` for scope/DoD/validation before implementation

## Guardrails Check (Required)

- [ ] I read `docs/AGENT_GUARDRAILS.md`
- [ ] I reviewed project memory: `/Users/am/.claude/projects/-Users-am-Downloads-antigravity-apps-am-clinica-main/memory/MEMORY.md`
- [ ] No new references to `profiles.role` (use `profiles.categoria`)
- [ ] I used the correct Supabase client for runtime context (client/server/admin)
- [ ] If I touched SQL/RLS/Auth, I validated role access logic with `categoria` or `get_my_role()`
- [ ] If I touched date-only parsing, I avoided `new Date('YYYY-MM-DD')` timezone drift

## Validation

- Commands run:
  - `...`
- Result:
  - `...`

## Risk & Mitigation

- Risk introduced (if any):
- Mitigation / rollback notes:
