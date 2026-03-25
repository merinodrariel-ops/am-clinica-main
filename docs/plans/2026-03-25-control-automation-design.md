# Agenda Control Automation Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add subtype-aware automation for carilla and ortodoncia controls so agenda completion creates the right annual follow-up, monthly tentative ortho control, and 10/15-day aligner reminders.

**Architecture:** Reuse the existing `recall_auto_rules` engine for fixed cadences (`control_carilla_inmediato`, `control_carilla_anual`, `control_ortodoncia`). Add a lightweight ortho-only configuration in the appointment editor to choose aligner replacement cadence (10 or 15 days), serialize that with notes metadata, and schedule a direct email reminder when an ortho control is completed.

**Tech Stack:** Next.js App Router, Server Actions, Supabase Postgres, existing `recall_auto_rules`, existing `scheduled_messages` queue.

---

## Validated Design

- `control_carilla_inmediato` completed -> create annual carilla follow-up and tentative annual appointment.
- `control_carilla_anual` completed -> create the next annual carilla follow-up and tentative annual appointment.
- `control_ortodoncia` completed -> create next monthly ortho control through `recall_auto_rules` and also schedule a direct email reminder for aligner replacement.
- Ortho reminder cadence is operator-selected per appointment: `10` or `15` days.
- `control_general` stays available but de-emphasized.
- `Diseño de sonrisa en resinas` remains a dedicated long appointment type with editable duration.
