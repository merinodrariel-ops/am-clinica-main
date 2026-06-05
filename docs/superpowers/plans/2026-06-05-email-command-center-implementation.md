# Email Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 1 of the internal `Emails` module with a new unified `email_messages` trace table, tracked Resend sends, an outbound inbox, template previews, and provider status.

**Architecture:** Supabase stores every new outbound email attempt in `email_messages`. `EmailService.send` remains the single high-level sender and wraps Resend calls with trace create/update behavior. `/admin/emails` reads server-side through authenticated actions and presents `Salida`, `Programados`, `Plantillas`, and `Proveedores` tabs.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Postgres/RLS, Resend, React Email, Tailwind classes, lucide-react, Node `tsx` tests.

---

## File Structure

- Create `supabase/migrations/20260605120000_email_messages_command_center.sql`
  - Defines `email_messages`, status/type checks, indexes, grants, RLS, and update timestamp trigger.
- Create `lib/email-message-tracking.ts`
  - Pure helpers for normalizing status, message type, recipients, metadata, provider labels, snapshot redaction, and provider config status.
- Create `tests/email-message-tracking.spec.ts`
  - Node assertions for the pure helpers.
- Modify `lib/resend-email.ts`
  - Return provider metadata consistently.
- Modify `lib/email-service.ts`
  - Add optional trace metadata to `send`, create a trace before send, update status after send, and keep existing public API compatible.
- Create `app/actions/email-messages.ts`
  - Auth-check internal actions for listing message rows, reading one detail, reading scheduled email rows, and reading provider status.
- Create `components/admin/emails/EmailsAdminClient.tsx`
  - Client UI for tabs, filters, outbound table, detail panel, scheduled list, template previews iframe, test send form, and provider status.
- Create `app/admin/emails/page.tsx`
  - Server route that loads initial data and renders the client.
- Modify `app/admin/email-templates/page.tsx`
  - Redirect to `/admin/emails?tab=templates` so old bookmarks still work.
- Modify `app/api/admin/email-templates/route.ts`
  - Mark preview test sends as `message_type = 'test'` and `source_module = 'email_templates'`.
- Modify `components/Sidebar.tsx`
  - Rename menu label to `Emails` and route to `/admin/emails`.
- Modify `lib/access-overrides.ts`
  - Rename label while keeping module key `email_templates` for compatibility.

## Tasks

### Task 1: Tracking Helpers

- [ ] Write `tests/email-message-tracking.spec.ts` with assertions for status labels, type labels, redaction, recipient normalization, and provider status.
- [ ] Run `npx tsx tests/email-message-tracking.spec.ts` and confirm it fails because `lib/email-message-tracking.ts` does not exist.
- [ ] Create `lib/email-message-tracking.ts` with the exported helpers used by the test.
- [ ] Re-run `npx tsx tests/email-message-tracking.spec.ts` and confirm it passes.

### Task 2: Supabase Migration

- [ ] Create `supabase/migrations/20260605120000_email_messages_command_center.sql`.
- [ ] Include `email_messages`, allowed status/type checks, indexes for date/status/type/provider/patient/appointment, `GRANT SELECT, INSERT, UPDATE ON public.email_messages TO authenticated`, and RLS policies using `public.get_my_role()`.
- [ ] Ensure anon has no grants and RLS is enabled.
- [ ] Add update timestamp trigger local to `email_messages`.

### Task 3: EmailService Trace Integration

- [ ] Extend `sendResendEmail` to return `{ success, id, provider: 'resend', error }`.
- [ ] Extend `EmailService.send` input with optional `messageType`, `sourceModule`, IDs, `templateKey`, `templateLabel`, snapshots, and `createdBy`.
- [ ] Create trace row with `sending` before provider call when Supabase admin env is available.
- [ ] Update trace row to `sent` or `failed` after provider call.
- [ ] Keep existing callers working without passing trace metadata.

### Task 4: Server Actions

- [ ] Create `app/actions/email-messages.ts`.
- [ ] Implement owner/admin/reception/developer access check with authenticated server client.
- [ ] Implement `listEmailMessagesAction`, `getEmailMessageDetailAction`, `listScheduledEmailMessagesAction`, and `getEmailProviderStatusAction`.
- [ ] Use service role only after user authorization.
- [ ] Select narrow fields and avoid dumping unrelated patient data.

### Task 5: UI

- [ ] Create `components/admin/emails/EmailsAdminClient.tsx`.
- [ ] Implement tabs `Salida`, `Programados`, `Plantillas`, `Proveedores`.
- [ ] Add filters for search, status, type, provider, and source module.
- [ ] Add detail panel with clear label: `Enviado al proveedor` is not `Entregado`.
- [ ] Reuse `/api/admin/email-templates` previews for the templates tab.
- [ ] Add provider status cards for Resend and Brevo contact-sync state.

### Task 6: Routing

- [ ] Create `app/admin/emails/page.tsx`.
- [ ] Redirect `app/admin/email-templates/page.tsx` to `/admin/emails?tab=templates`.
- [ ] Update sidebar label and href.
- [ ] Keep `email_templates` permission key stable.

### Task 7: Verification

- [ ] Run `npx tsx tests/email-message-tracking.spec.ts`.
- [ ] Run `npx eslint lib/email-message-tracking.ts lib/email-service.ts lib/resend-email.ts app/actions/email-messages.ts components/admin/emails/EmailsAdminClient.tsx app/admin/emails/page.tsx app/api/admin/email-templates/route.ts components/Sidebar.tsx lib/access-overrides.ts`.
- [ ] Run `npm run build` if targeted lint passes.
- [ ] If local env is available, start dev server and verify `/admin/emails` in browser.
- [ ] Do not send a real production email unless explicitly requested after the UI exists.
