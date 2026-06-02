---
name: am-agenda-rules
description: Agenda and portal rules for am-clinica-main. Use when touching appointments, agenda metrics, shared agenda links, doctor portal access, reminders, post-appointment surveys, patient shortcuts, date ranges, or any UI/API flow under agenda, portal, or scheduling.
---

# AM Agenda Rules

Apply these invariants before changing agenda behavior.

## Inspect First

Start from the active implementation:

- `app/agenda/page.tsx`
- `components/agenda/AgendaCalendar.tsx`
- `app/actions/agenda-metrics.ts`
- `app/actions/doctor-agenda.ts`
- `app/agenda-compartida/page.tsx`
- `components/portal/MinimalAgendaDay.tsx`
- `app/api/agenda/remind/route.ts`
- `lib/am-scheduler/notification-service.ts`
- `lib/recall-constants.ts`

Use current code as truth; memory and prior notes can be stale.

## Date Rules

- Calculate day, week, month, and year boundaries in `America/Argentina/Buenos_Aires`.
- Do not use naive UTC month/year boundaries for agenda metrics.
- Expect unauthenticated `/agenda` production checks to redirect to `/login?redirect=%2Fagenda`.

## Business Rules

- Preserve the patient-required invariant for clinical appointments unless the user explicitly changes that policy.
- For reception speed, prefer small inline shortcuts over broad patient/agenda refactors.
- For all-doctor shared agenda, prefer weekly views over single-day snapshots.
- For agenda opportunity KPIs, prioritize first consults, cleanings, carillas controls, and botox when the user frames the dashboard commercially.
- For doctor access guidance, anchor on `/portal`, `/portal/agenda`, and `/portal/liquidation`.

## Reminder And Survey Rules

Before changing post-appointment feedback:

- Verify whether the outbound channel is email, WhatsApp, or both.
- Inspect required patient fields.
- Reuse existing Resend and scheduler helpers when possible.
