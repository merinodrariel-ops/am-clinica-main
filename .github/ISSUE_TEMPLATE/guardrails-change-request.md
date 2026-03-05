---
name: Guardrails Change Request
about: Change request with mandatory project guardrails context
title: "[Change] "
labels: ["needs-triage"]
assignees: []
---

## Context

- What problem are we solving?
- Business/clinical impact:

## Scope

- In scope:
- Out of scope:

## Guardrails (Required)

- [ ] Read `docs/AGENT_GUARDRAILS.md`
- [ ] Read memory file: `/Users/am/.claude/projects/-Users-am-Downloads-antigravity-apps-am-clinica-main/memory/MEMORY.md`
- [ ] No new usage of `profiles.role` (must use `profiles.categoria`)
- [ ] Correct Supabase client per runtime (client/server/admin)
- [ ] If SQL/RLS/Auth touched: validate with `categoria` / `get_my_role()`
- [ ] If date-only logic touched: avoid `new Date('YYYY-MM-DD')` timezone drift

## Proposed Changes

1. 
2. 
3. 

## Acceptance Criteria

- [ ] 
- [ ] 
- [ ] 

## Validation Plan

- Commands to run:
  - `...`
- Expected result:
  - `...`

## Risks / Rollback

- Risks:
- Rollback plan:
