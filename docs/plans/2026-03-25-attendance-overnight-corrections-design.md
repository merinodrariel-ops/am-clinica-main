# Attendance Overnight Corrections Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make attendance imports and manual resolutions correctly handle exits after midnight and allow quick correction of missing or duplicated marks.

**Architecture:** Reuse the existing import parser's overnight rule (exit earlier than entry means next day) and bring that rule into the manual resolution flow used by observed records. Expand the observed-records UI with an explicit `salida al día siguiente` toggle plus clearer correction copy, and fix the observed-record queries so imported lowercase states are always visible for review.

**Tech Stack:** Next.js App Router, React, Supabase `registro_horas`, existing Prosoft import action and `ObservadosTab` resolution modal.

---

## Validated Design

- Import keeps treating an exit earlier than entry as `día siguiente`.
- Manual resolution can explicitly mark `salida al día siguiente`.
- Missing/duplicate marks continue to resolve from the existing observed modal, but with a clearer correction flow.
- Observed queries must include both `Observado` and `observado` states so imported rows always appear for correction.
