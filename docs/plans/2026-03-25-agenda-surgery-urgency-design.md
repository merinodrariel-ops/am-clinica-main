# Agenda Surgery Urgency Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `cirugia_implantes` to agenda, merge urgency UX into `Control general / urgencia`, and render surgery appointments in red.

**Architecture:** Keep historical `urgencia` data compatible, but remove it from the editor and relabel the generic control option as `Control general / urgencia`. Add a dedicated `cirugia_implantes` enum value, expose it in the agenda modal, and force surgery-related appointments to use a red visual style instead of doctor color.

**Tech Stack:** Next.js App Router, React, Supabase Postgres enums, existing agenda modal/calendar/resource views.

---

## Validated Design

- New appointment type: `cirugia_implantes`.
- Editor label for generic control: `Control general / urgencia`.
- `urgencia` remains supported in existing data, but is no longer the primary visible option in the selector.
- `cirugia_implantes` and surgery-related appointments render in red in both agenda views.
