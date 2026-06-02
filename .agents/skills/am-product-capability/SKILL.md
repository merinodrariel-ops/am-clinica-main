---
name: am-product-capability
description: Capability-contract workflow for am-clinica-main. Use before implementing fuzzy or multi-surface clinic requests such as new agenda workflows, owner dashboards, patient follow-up, portal access, financing/caja behavior, public conversion flows, or anything where business rules and implementation constraints must be explicit before code changes.
---

# AM Product Capability

Use this to turn a loose clinic idea into implementation constraints before coding.

## Contract

Produce a compact capability contract:

- Capability: who uses it, what they can do, and what outcome changes.
- Surfaces: pages, modals, API routes, scheduler jobs, emails, WhatsApp, Supabase tables, or public URLs involved.
- Invariants: rules that must not break.
- Data implications: tables, fields, auth/RLS, date boundaries, and migration needs.
- Non-goals: what this change intentionally does not cover.
- Open questions: only blockers that truly affect implementation.
- Handoff: ready to implement, needs architecture review, or needs user clarification.

## AM Invariants

- Agenda ranges use `America/Argentina/Buenos_Aires`.
- Clinical appointments should keep patient-required rules unless the schema/business policy changes.
- Shared all-doctor agenda links should be practical weekly views when the user asks to share the whole agenda.
- Existing portal entry should favor `/portal`, especially `/portal/agenda` and `/portal/liquidation`, over older portal screens.
- Patient feedback/reminder flows must verify the intended outbound channel: email, WhatsApp, or both.
- Public conversion decisions should not override the user's preference for direct WhatsApp without a concrete reason.

## Use

Ask for clarification only when a reasonable implementation would be risky. Otherwise, state assumptions clearly and proceed to the appropriate implementation skill.
