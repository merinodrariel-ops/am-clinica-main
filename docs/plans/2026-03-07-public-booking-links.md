# Public Booking Links Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace brittle public-booking mode logic with AM-owned configurable mode routing, seed schedules to mirror prior Google behavior, and keep all future schedule/reminder changes inside AM.

**Architecture:** Keep `doctor_schedules` + `agenda_appointments` as the slot source of truth. Add explicit doctor-to-mode mapping in DB, then make the doctors endpoint mode-aware and drive UI filtering from API instead of name matching. Centralize all admission booking links so form and templates stay consistent.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + migrations), existing AM scheduler and notification rules.

---

### Task 1: Add Public Booking Mode Config Table

**Files:**
- Create: `supabase/migrations/20260307190000_public_booking_mode_config.sql`
- Modify: `docs/plans/2026-03-07-public-booking-links-design.md`
- Test: `supabase/migrations/20260307190000_public_booking_mode_config.sql` (manual SQL validation)

**Step 1: Write failing validation query (before migration)**

```sql
select doctor_id, booking_mode from public.public_booking_doctor_modes limit 1;
```

**Step 2: Run query to verify it fails**

Run: execute in Supabase SQL editor (or local DB)
Expected: FAIL with relation does not exist.

**Step 3: Write minimal migration**

```sql
create table if not exists public.public_booking_doctor_modes (
  doctor_id uuid primary key references public.profiles(id) on delete cascade,
  booking_mode text not null check (booking_mode in ('merino','staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Step 4: Run query to verify it passes**

Run: `select * from public.public_booking_doctor_modes limit 1;`
Expected: PASS (0+ rows).

**Step 5: Commit**

```bash
git add supabase/migrations/20260307190000_public_booking_mode_config.sql docs/plans/2026-03-07-public-booking-links-design.md
git commit -m "feat: add public booking mode config table"
```

### Task 2: Seed Approved Schedule Baseline

**Files:**
- Modify: `supabase/migrations/20260307190000_public_booking_mode_config.sql`
- Test: `app/api/public-booking/slots/route.ts`

**Step 1: Write failing schedule check query**

```sql
select doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes
from public.doctor_schedules
where doctor_id in ('<MERINO_ID>', '<STAFF_ID>');
```

**Step 2: Run query to verify seed rows are missing**

Run: execute query in SQL editor
Expected: No rows or wrong cadence.

**Step 3: Add seed DML for baseline**

```sql
-- Merino: Mon(1), Wed(3), Fri(5) 14:00-18:30, 60 + 10
-- Staff: Thu(4) 15:30-18:30, 60 + 0
-- Upsert rows in doctor_schedules and mode mapping table
```

**Step 4: Re-run query to verify seed is present**

Run: same SQL query
Expected: PASS with approved baseline rows.

**Step 5: Commit**

```bash
git add supabase/migrations/20260307190000_public_booking_mode_config.sql
git commit -m "feat: seed public booking baseline schedules"
```

### Task 3: Make Doctors API Mode-Aware

**Files:**
- Modify: `lib/public-booking.ts`
- Modify: `app/api/public-booking/doctors/route.ts`
- Test: `tests/public-booking/public-booking-mode.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookingMode } from '@/lib/public-booking';

describe('normalizeBookingMode', () => {
  it('accepts merino and staff only', () => {
    assert.equal(normalizeBookingMode('merino'), 'merino');
    assert.equal(normalizeBookingMode('staff'), 'staff');
    assert.equal(normalizeBookingMode('all'), 'all');
    assert.equal(normalizeBookingMode('xxx'), 'all');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/public-booking/public-booking-mode.test.ts`
Expected: FAIL (helper not found).

**Step 3: Write minimal implementation**

```ts
export function normalizeBookingMode(value?: string): 'all' | 'merino' | 'staff' {
  const v = (value || '').toLowerCase().trim();
  if (v === 'merino' || v === 'staff') return v;
  return 'all';
}
```

Also update doctors query path to filter by `public_booking_doctor_modes` when mode is `merino` or `staff`.

**Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/public-booking/public-booking-mode.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/public-booking.ts app/api/public-booking/doctors/route.ts tests/public-booking/public-booking-mode.test.ts
git commit -m "feat: add mode-aware public doctors filtering"
```

### Task 4: Drive UI Filtering From API Mode (Not Name Parsing)

**Files:**
- Modify: `components/admission/PublicBookingScheduler.tsx`
- Test: `tests/public-booking/public-booking-scheduler-mode.test.tsx`

**Step 1: Write failing test**

```tsx
it('requests doctors endpoint with selected mode', async () => {
  // expect fetch('/api/public-booking/doctors?mode=merino') when modo=merino
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/public-booking/public-booking-scheduler-mode.test.tsx`
Expected: FAIL (current code calls endpoint without mode query).

**Step 3: Implement minimal change**

```ts
const params = new URLSearchParams();
if (bookingMode !== 'all') params.set('mode', bookingMode);
const response = await fetch(`/api/public-booking/doctors?${params.toString()}`, { cache: 'no-store' });
```

Remove name-based filtering block from client.

**Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/public-booking/public-booking-scheduler-mode.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add components/admission/PublicBookingScheduler.tsx tests/public-booking/public-booking-scheduler-mode.test.tsx
git commit -m "refactor: move booking mode filtering to API"
```

### Task 5: Centralize Admission Booking Links

**Files:**
- Create: `lib/admission-booking-links.ts`
- Modify: `components/admission/PremiumAdmissionForm.tsx`
- Modify: `lib/email-templates.ts`
- Modify: `lib/prospect-templates.ts`
- Test: `tests/public-booking/admission-booking-links.test.ts`

**Step 1: Write failing test**

```ts
it('returns canonical internal links per mode', () => {
  // merino -> /admision/agendar?modo=merino
  // staff -> /admision/agendar?modo=staff
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/public-booking/admission-booking-links.test.ts`
Expected: FAIL (module missing).

**Step 3: Add minimal implementation and wire usages**

```ts
export const ADMISSION_BOOKING_LINKS = {
  merino: '/admision/agendar?modo=merino',
  staff: '/admision/agendar?modo=staff',
  generic: '/admision/agendar',
} as const;
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/public-booking/admission-booking-links.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/admission-booking-links.ts components/admission/PremiumAdmissionForm.tsx lib/email-templates.ts lib/prospect-templates.ts tests/public-booking/admission-booking-links.test.ts
git commit -m "refactor: centralize admission booking links"
```

### Task 6: End-to-End Smoke Validation

**Files:**
- Modify: `docs/plans/2026-03-07-public-booking-links-design.md`
- Test: `app/admision/agendar/page.tsx`, `app/api/public-booking/*`

**Step 1: Write failing smoke checklist**

```md
- merino mode shows only merino-configured doctors
- staff mode shows only staff-configured doctors
- slot cadence matches seeded schedule
- booking inserts appointment and sends notification
```

**Step 2: Run smoke flow and capture failures**

Run: `npm run lint`
Expected: PASS.

Run manual flow:
- Open `/admision/agendar?modo=merino`
- Open `/admision/agendar?modo=staff`
- Create one booking each
Expected: identify any mismatch.

**Step 3: Apply minimal fixes found during smoke checks**

```ts
// Fix only mismatches detected in manual run
```

**Step 4: Re-run lint + manual smoke**

Run: `npm run lint`
Expected: PASS and smoke checklist completed.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: complete public booking links migration"
```
