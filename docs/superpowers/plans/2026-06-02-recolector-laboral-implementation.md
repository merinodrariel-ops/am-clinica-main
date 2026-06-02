# Recolector Laboral Team AM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public Team AM job application collector, store CVs privately in Supabase, expose an internal review panel, and link it from the public Team AM page.

**Architecture:** `am-clinica-main` owns data capture, validation, Supabase writes, private Storage, and admin review. `am-paginas-web` owns discovery from `/equipo-am` and legacy labor URL redirects. The public form submits through a server action using the existing admin Supabase helper, never direct anon table writes.

**Boundary:** This is the mass first-contact funnel for people who want to work at AM. It must stay separate from `registro-prestador`, which is the later formal onboarding step after AM selects a person. Submitting this form must not create `personal` rows, portal users, payroll/liquidation setup, or internal permissions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres, Supabase Storage private bucket, Zod, Tailwind classes, lucide-react.

---

## File Structure

### `am-clinica-main`

- Create `supabase/migrations/20260602120000_job_applications.sql`
  - Creates `public.job_applications`.
  - Enables RLS without public policies.
  - Creates private Storage bucket `job-applications` with size/MIME limits.
- Create `lib/job-applications.ts`
  - Owns field constants, status labels, validation helpers, file safety, and filename sanitization.
- Create `app/actions/job-applications.ts`
  - Owns public submit action, admin list/update actions, and signed CV URL action.
- Create `components/job-applications/JobApplicationForm.tsx`
  - Public multi-section form with honeypot, minimum-time token, file picker, submit states, and Spanish copy.
- Create `app/trabaja-en-am/page.tsx`
  - Public canonical form route.
- Create `app/trabaja-con-nosotros/page.tsx`
  - Alias route that renders the same form for future-friendly naming.
- Create `app/admin/postulaciones/page.tsx`
  - Internal dashboard for review.
- Modify `components/Sidebar.tsx`
  - Adds `Postulaciones` for owner/admin/developer.
- Create or modify focused tests under `tests/job-applications.spec.ts`
  - Tests validation, file safety, and filename sanitization without real Supabase.

### `am-paginas-web`

- Modify `amesteticadental/src/app/equipo-am/page.tsx`
  - Adds secondary hero CTA and bottom CTA.
- Modify `amesteticadental/next.config.ts`
  - Changes `/trabaja-en-am` and `/unete-al-team-am` redirects from `/` to the clinic form URL or local route.
- Modify `amesteticadental/src/middleware.ts`
  - Keeps middleware redirects consistent with `next.config.ts`.
- Optionally create `amesteticadental/src/app/trabaja-en-am/page.tsx`
  - If cross-domain redirect is not desired, create a local page that redirects to the clinic form with explicit copy.

## Implementation Tasks

### Task 1: Supabase Schema And Storage

**Files:**
- Create: `supabase/migrations/20260602120000_job_applications.sql`

- [ ] **Step 1: Write migration**

```sql
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  area text not null,
  other_area text,
  experience text not null,
  area_responsibilities text not null,
  instagram_url text not null,
  email text not null,
  location text not null,
  teamwork_answer text not null,
  learning_interest text not null,
  long_term_goals text not null,
  team_contribution text not null,
  why_choose_you text not null,
  cv_storage_path text not null,
  cv_original_filename text not null,
  cv_mime_type text not null,
  cv_size_bytes integer not null,
  status text not null default 'nuevo',
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  source text not null default 'web_public',
  ip_hash text,
  user_agent_hash text,
  constraint job_applications_status_check check (status in ('nuevo', 'preseleccionado', 'entrevista', 'descartado', 'contratado')),
  constraint job_applications_cv_size_check check (cv_size_bytes > 0 and cv_size_bytes <= 10485760)
);

alter table public.job_applications enable row level security;

create index if not exists job_applications_created_at_idx on public.job_applications (created_at desc);
create index if not exists job_applications_status_idx on public.job_applications (status);
create index if not exists job_applications_area_idx on public.job_applications (area);
create index if not exists job_applications_email_idx on public.job_applications (lower(email));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-applications',
  'job-applications',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 2: Verify migration syntax locally**

Run: `npx supabase migration list --local`

Expected: command runs or reports local Supabase is not configured. If local Supabase is unavailable, inspect SQL syntax manually and rely on deployment migration application.

### Task 2: Shared Validation Library

**Files:**
- Create: `lib/job-applications.ts`
- Create: `tests/job-applications.spec.ts`

- [ ] **Step 1: Write tests**

```ts
import assert from 'node:assert/strict';
import {
  ALLOWED_JOB_APPLICATION_MIME_TYPES,
  MAX_JOB_APPLICATION_FILE_BYTES,
  sanitizeJobApplicationFileName,
  validateJobApplicationFile,
} from '../lib/job-applications';

assert.equal(sanitizeJobApplicationFileName('../../CV Ariel Merino.pdf'), 'CV-Ariel-Merino.pdf');
assert.equal(sanitizeJobApplicationFileName('mi cv final.docx'), 'mi-cv-final.docx');

assert.equal(validateJobApplicationFile({
  name: 'cv.pdf',
  type: 'application/pdf',
  size: 1000,
}).ok, true);

assert.equal(validateJobApplicationFile({
  name: 'cv.exe',
  type: 'application/x-msdownload',
  size: 1000,
}).ok, false);

assert.equal(validateJobApplicationFile({
  name: 'cv.pdf',
  type: 'application/pdf',
  size: MAX_JOB_APPLICATION_FILE_BYTES + 1,
}).ok, false);

assert.ok(ALLOWED_JOB_APPLICATION_MIME_TYPES.includes('application/pdf'));
console.log('job-applications.spec.ts: ok');
```

- [ ] **Step 2: Implement library**

Export constants for areas/statuses/MIME types, `sanitizeText`, `sanitizeLongText`, `sanitizeJobApplicationFileName`, `validateJobApplicationFile`, `normalizeEmail`, `hashPrivacyValue`, and `buildJobApplicationStoragePath`.

- [ ] **Step 3: Run test**

Run: `npx tsx tests/job-applications.spec.ts`

Expected: `job-applications.spec.ts: ok`

### Task 3: Server Actions

**Files:**
- Create: `app/actions/job-applications.ts`

- [ ] **Step 1: Implement public submit action**

Use `createAdminClient()` from `utils/supabase/admin.ts`. Validate all fields server-side, reject honeypot, reject submissions under 4 seconds, validate file type/size, upload file to `job-applications`, then insert `job_applications`. Store only `cv_storage_path`, not a public URL.

- [ ] **Step 2: Implement admin actions**

Export:

```ts
export async function listJobApplications(filters?: { status?: string; area?: string; search?: string })
export async function updateJobApplicationReview(input: { id: string; status: JobApplicationStatus; review_notes?: string })
export async function createJobApplicationCvSignedUrl(id: string)
```

Each admin action must verify an authenticated user exists via SSR client before using service role. Keep selects narrow and avoid logging applicant content.

- [ ] **Step 3: Run lint on action**

Run: `npx eslint app/actions/job-applications.ts`

Expected: no lint errors.

### Task 4: Public Form

**Files:**
- Create: `components/job-applications/JobApplicationForm.tsx`
- Create: `app/trabaja-en-am/page.tsx`
- Create: `app/trabaja-con-nosotros/page.tsx`

- [ ] **Step 1: Build form UI**

Use the existing `registro-prestador` visual language: dark background, compact sections, plain Spanish labels, file picker, consent checkbox, honeypot field named `company`, and `form_started_at`.

- [ ] **Step 2: Wire submit**

Submit `FormData` to `submitJobApplication`. Show success message without exposing internals: "Recibimos tu postulacion. Si tu perfil coincide con una busqueda activa, el equipo AM te va a contactar."

- [ ] **Step 3: Run focused lint**

Run:

```bash
npx eslint components/job-applications/JobApplicationForm.tsx app/trabaja-en-am/page.tsx app/trabaja-con-nosotros/page.tsx
```

Expected: no lint errors.

### Task 5: Admin Review Panel

**Files:**
- Create: `app/admin/postulaciones/page.tsx`
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Create admin page**

Server-render initial list with `listJobApplications()`. Render cards/table with status, area, date, name, email, location, Instagram, answers, note field, status select, and CV button.

- [ ] **Step 2: Add sidebar item**

Add `Postulaciones` with `Briefcase` or `Mail` icon for roles `owner`, `admin`, and `developer`.

- [ ] **Step 3: Run focused lint**

Run:

```bash
npx eslint app/admin/postulaciones/page.tsx components/Sidebar.tsx
```

Expected: no lint errors.

### Task 6: Public Website CTA

**Files in `/Users/arimacm5/Documents/Proyectos Antigravity/am-paginas-web`:**
- Modify: `amesteticadental/src/app/equipo-am/page.tsx`
- Modify: `amesteticadental/next.config.ts`
- Modify: `amesteticadental/src/middleware.ts`

- [ ] **Step 1: Add CTA to `/equipo-am`**

Add a secondary hero link and a bottom pre-contact section. Text:

```text
Trabaja con nosotros
Si queres sumarte a Team AM, dejanos tus datos y CV.
```

Target: production clinic form URL for `/trabaja-en-am`.

- [ ] **Step 2: Fix legacy redirects**

Change `/trabaja-en-am`, `/trabaja-en-am/`, `/unete-al-team-am`, and `/unete-al-team-am/` so they no longer redirect to `/`.

- [ ] **Step 3: Run focused lint/build**

Run from `am-paginas-web/amesteticadental`:

```bash
npx eslint src/app/equipo-am/page.tsx src/middleware.ts next.config.ts
npm run build
```

Expected: lint passes and build completes.

### Task 7: Local Verification And Production Handoff

**Files:**
- All touched files.

- [ ] **Step 1: Clinic focused checks**

Run:

```bash
npx tsx tests/job-applications.spec.ts
npx eslint lib/job-applications.ts app/actions/job-applications.ts components/job-applications/JobApplicationForm.tsx app/trabaja-en-am/page.tsx app/trabaja-con-nosotros/page.tsx app/admin/postulaciones/page.tsx components/Sidebar.tsx
npm run build
```

Expected: tests pass, lint passes, build completes.

- [ ] **Step 2: Public web focused checks**

Run from `am-paginas-web/amesteticadental`:

```bash
npx eslint src/app/equipo-am/page.tsx src/middleware.ts next.config.ts
npm run build
```

Expected: lint passes and build completes.

- [ ] **Step 3: Manual route verification**

Run local dev servers if needed and verify:

- `/equipo-am` shows "Trabaja con nosotros".
- `/trabaja-en-am` renders the form.
- Invalid file upload is rejected.
- Valid PDF submit creates a Supabase row and private Storage object.
- Admin `/admin/postulaciones` can generate a signed CV URL.

- [ ] **Step 4: Commit scoped changes**

Commit `am-clinica-main` changes separately from `am-paginas-web` changes.

---

## Self-Review

- Spec coverage: covers Team AM CTA, public form, Supabase private CV storage, anti-spam, admin review, and legacy redirects.
- Placeholder scan: no placeholder task remains; optional local Supabase caveat is explicit.
- Type consistency: status and field names match the design document.
