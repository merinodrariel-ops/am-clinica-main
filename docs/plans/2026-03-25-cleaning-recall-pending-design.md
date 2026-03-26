# Cleaning Recall Pending Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make cleaning recalls rebook the patient's usual cleaning type at the same hour, with +4 or +6 month options, and render pending appointments with an orbiting confirmation cue.

**Architecture:** Split generic cleaning into `limpieza_convencional` and `limpieza_laser`, then drive the quick rebooking flow from the last completed cleaning type and original appointment time/doctor. Pending appointments keep a normal card layout, but gain a subtle orbiting border-light animation to signal that confirmation is still required.

**Tech Stack:** Next.js App Router, React, Supabase Postgres enums, existing agenda modal/calendar/resource views, recalls worklist.

---

## Validated Design

- New cleaning types: `limpieza_convencional` and `limpieza_laser`.
- Quick rebook buttons become `+4 meses` and `+6 meses`.
- Rebooked cleaning preserves the same doctor and approximately the same hour as the source visit.
- Rebooked cleaning defaults to `pending`.
- Rebooked title matches the patient's usual cleaning type.
- Pending appointments use an orbiting light around the card instead of the current generic look.
