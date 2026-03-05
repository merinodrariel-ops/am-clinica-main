# AM Clínica — Contexto para agentes Claude

> **🚨 CONTEXTO CRÍTICO — LEER ESTO ANTES DE TOCAR CÓDIGO:**
>
> Este proyecto (`am-clinica-main`) tuvo un problema crítico: la columna `profiles.role` fue renombrada a `profiles.categoria` directamente en el dashboard de Supabase (sin migración). PostgreSQL no actualiza los cuerpos de las funciones SQL al renombrar columnas, por lo que todas las funciones/triggers que referenciaban `role` quedaron rotas silenciosamente.
>
> **Consecuencias que ocurrieron:**
> - **Login roto:** error *"Database error granting user"* y 500 en `/auth/v1/token`.
> - **Políticas RLS rotas:** errores *column "role" does not exist (42703)* ignorados en consola.
> - **Build roto:** `lib/supabase.ts` dejó de exportar `supabase`, y múltiples archivos lo importaban.
>
> **Lo que ya se arregló (NO revertir):**
> - Se aplicaron migraciones SQL en producción para arreglar los triggers: `handle_new_user`, `sync_auth_user_profile_metadata`, `sync_google_user_profile`, `handle_auth_user_sync`, `sync_auth_profile_from_auth_users`, `sync_google_oauth_profile`, `can_user_edit_record`, `get_my_role`.
> - Se migraron más de 12 archivos que usaban el cliente raw (`lib/supabase.ts`) para usar `@/utils/supabase/client` (browser) o `@/utils/supabase/server` (server actions/components).
>
> **REGLA DE ORO PARA ESTE PROYECTO (Cumplir estrictamente):**
> 1. **Cliente Browser** → `import { createClient } from '@/utils/supabase/client'`
> 2. **Server Actions / Server Components** → `const supabase = await createClient()` utilizando `@/utils/supabase/server`
> 3. **API Routes** → `createAdminClient()` desde `@/utils/supabase/admin` (si se necesitan permisos globales y se salta el RLS).
> 4. **NUNCA importar `{ supabase }` de `@/lib/supabase`** — ese export ya no existe. Ese archivo es sólo para tipos.
> 5. **La columna correcta para roles es `categoria`**, NO `role`. Usa `categoria` en TODO SQL, RLS, y código TypeScript que toque la tabla `profiles`.

## Documentación para agentes (leer en este orden)

1. `docs/AGENT_GUARDRAILS.md` — reglas críticas, checklist pre-entrega, formato de handoff
2. `docs/AGENT_ROUTING.md` — qué agente usar según el módulo, template de handoff entre agentes
3. `docs/OWNERSHIP.md` — quién decide en cada módulo, protocolo de lock/unlock
4. `docs/TASK_CONTRACT.md` — template de scope + DoD antes de implementar
5. `docs/AGENT_PROMPT.md` — prompt maestro copy/paste para iniciar cualquier sesión

---

## Stack
- Next.js 16 App Router + React 19 + TypeScript 5
- Supabase (PostgreSQL + RLS + Auth via Google OAuth)
- FullCalendar v6 (community, no premium) — daygrid, timegrid, interaction
- Tailwind CSS 4, Framer Motion, Recharts, Sonner (toasts)
- Resend (email), Twilio (WhatsApp), Google APIs (Drive, Sheets, Calendar)
- Supabase SSR via `@supabase/ssr` — server client: `utils/supabase/server.ts`, admin: `utils/supabase/admin.ts`

## Key Architecture
- Server Actions in `app/actions/` (not API routes) for most CRUD
- API routes for webhooks, cron jobs, and integrations
- RLS on all tables; role hierarchy: owner > admin > reception > developer > odontologo > asistente > laboratorio > partner_viewer
- Patient table: `pacientes` (id_paciente, nombre, apellido, email, telefono)
- Appointments table: `agenda_appointments` (doctor_id → profiles.id, patient_id → pacientes.id_paciente)
- Profiles table: `profiles` (id, full_name, **categoria**, email) — columna renombrada de `role` a `categoria` (cambio manual en dashboard, sin migration)

## Common Pitfalls
- JSDoc block comments with `*/` pattern (e.g. cron schedule `*/5`) break TypeScript — use alternative text
- `doctor?.full_name` is `string | undefined`; if interface expects `{ full_name: string }` use conditional: `doc?.full_name ? { full_name: doc.full_name } : undefined`
- FullCalendar Resource View requires Premium license — custom CSS grid approach used instead
- `createAdminClient()` returns a Proxy if env vars missing (build-safe); fine to call in API routes
- **TIMEZONE BUG (critical):** `new Date('YYYY-MM-DD')` parses as UTC midnight, which in Argentina (UTC-3) becomes the PREVIOUS day at 21:00. This breaks month range calculations. ALWAYS parse date-only strings as local: `const [y, m, d] = str.split('-').map(Number); new Date(y, m-1, d)`.
- **`profiles.categoria` no `profiles.role`:** La columna de rol se llama `categoria` en la DB live. `get_my_role()` hace `SELECT categoria FROM profiles`. Cualquier SQL nuevo que necesite el rol debe usar `get_my_role()` o `profiles.categoria` — nunca `profiles.role`. Las 22 policies que usaban `.role` fueron corregidas en `20260305210000_fix_rls_role_to_categoria.sql`.
- **Supabase client mismatch:** `lib/supabase.ts` (raw `@supabase/supabase-js`) does NOT share auth session with `@supabase/ssr` (`createBrowserClient`). All client components MUST use `createClient()` from `utils/supabase/client.ts` for queries. If records are "invisible" pero existen en DB, verificar: (1) qué cliente supabase se usa, (2) `created_by` no es NULL, (3) RLS RESTRICTIVE policy `google_user_restrict_own_rows`.
- **`useAuth()` devuelve `categoria`, NO `role`** — todos los componentes deben desestructurar `const { categoria } = useAuth()` o `const { categoria: role } = useAuth()`. La prop `role` no existe en `AuthContextType`.
- **`WorkerProfile` no tiene campo `rol`** — usar `worker.categoria` y `worker.area`. El campo `rol` fue eliminado.
- **`StockMovementRecord`** usa: `tipo_movimiento`, `cantidad`, `motivo`, `usuario`, `item` — NO `type`, `qty`, `note`, `created_by_label`, `product`.
- **`ProductRecord`** usa: `notes` (barcode/descripción), `link` (QR/URL) — NO `barcode`, `qr_code`, `is_active`.

## Reglas de negocio — AM Clínica (NO asumir lo contrario)
- **SIN porcentajes:** La clínica NO usa porcentajes para liquidar absolutamente nada. No proponer ni implementar modelos de pago por porcentaje.
- **Prestaciones las cargan las asistentes**, no los odontólogos. El odontólogo no tiene acceso de carga. Solo ve sus propias prestaciones al fin de mes.
- **Privacidad inter-profesional:** Los odontólogos no deben ver las prestaciones ni los montos de sus colegas. Tampoco deben ver los precios de las prestaciones en ningún momento.
- **Liquidación:** Se basa en las prestaciones realizadas por el profesional en el mes, cargadas por las asistentes. Los precios son visibles solo por admin/owner.
- **Portal de prestaciones:** categorías `['owner', 'admin', 'reception', 'asistente', 'developer']` tienen modo registro (pueden cargar). El resto (odontologo, etc.) tienen modo readonly.

## Migración hotfix: admin alias + personal sync
- Archivo: `supabase/migrations/20260306150000_admin_alias_sync_personal_hotfix.sql`
- **Qué hace:**
  1. Reescribe `sync_profile_to_personal()` sin columna `rol` (ya no existe), usando `categoria`
  2. Normaliza aliases: `administradora/administrador/administracion` → `'admin'`; `dentist` → `'odontologo'`; `assistant` → `'asistente'`; `lab` → `'laboratorio'`
  3. `v_tipo` se calcula como: owner/odontologo → `'odontologo'`, resto → `'prestador'`
  4. Recrea `crear_personal()` con firma legacy (12 params) compatible con la DB actual
  5. Normaliza `profiles.categoria` y `auth.users.raw_user_meta_data->categoria` que tengan aliases de admin
  6. Reescribe `get_my_role()` para ser robusto contra aliases de admin
- **Estado:** Debe ejecutarse manualmente en Supabase SQL Editor si no se hizo ya
- **Implicación:** El trigger `sync_profile_to_personal` ya NO usa `personal.rol`; usa `personal.categoria`

## Env Vars relevantes
- `GOOGLE_CALENDAR_ID` — calendar to sync
- `CALENDLY_WEBHOOK_SECRET` — Calendly signing key
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- `CRON_SECRET` — protects `/api/agenda/remind`
