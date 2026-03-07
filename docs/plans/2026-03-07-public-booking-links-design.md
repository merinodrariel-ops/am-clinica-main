# Public Booking Links Design

## Context

- The admission success step already points to internal links for booking:
  - `components/admission/PremiumAdmissionForm.tsx:1017` (`/admision/agendar?modo=merino`)
  - `components/admission/PremiumAdmissionForm.tsx:1027` (`/admision/agendar?modo=staff`)
- The public booking flow is already operational:
  - UI: `app/admision/agendar/page.tsx`, `components/admission/PublicBookingScheduler.tsx`
  - API: `app/api/public-booking/doctors/route.ts`, `app/api/public-booking/slots/route.ts`, `app/api/public-booking/route.ts`
  - Availability engine: `lib/public-booking.ts`
- Current mode filter in UI is name-based (`Merino` vs non-Merino), which is brittle.

## Goals

- Use AM-owned booking links as the canonical flow (no external booking links in runtime flow).
- Replicate prior Google schedule behavior as initial seed.
- Keep schedules, slot cadence, and reminders editable in the internal system.
- Remove fragile mode filtering by doctor name.

## Constraints

- The provided Google public links expose title/timezone metadata in static HTML, but not full schedule rules in a stable machine-readable payload.
- Existing reminder infrastructure already exists and should be reused (`notification_rules` + notification service).
- Existing schedule storage already exists and should remain the source of truth (`doctor_schedules`).

## Approved Product Decisions

- Strategy: hybrid migration (approved by user).
- Seed strategy: infer + validate (approved by user).
- Seed baseline approved:
  - Merino: Mon/Wed/Fri, 14:00-18:30, 60-minute appointments, 10-minute buffer.
  - Staff: Thu, 15:30-18:30, 60-minute appointments, 0-minute buffer.

## Technical Decisions

- Keep booking entrypoints as internal mode links (`?modo=merino|staff`).
- Introduce explicit doctor-to-mode configuration in DB (avoid name parsing in UI).
- Keep `doctor_schedules` + `agenda_appointments` as slot truth.
- Keep `notification_rules` as reminder control plane.
- Centralize admission booking links in one place to reuse in form/email/templates.

## Rollout

1. Add DB config and seed schedules.
2. Switch doctors API filtering to DB mode config.
3. Pass mode to doctors endpoint from booking UI.
4. Centralize links and update admission/email templates.
5. Validate with smoke tests and manual booking checks.
