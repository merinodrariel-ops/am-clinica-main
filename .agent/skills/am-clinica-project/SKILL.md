---
name: am-clinica-project
description: "Contexto obligatorio para trabajar en AM Clínica. Usar siempre al inicio de cualquier sesión en este proyecto."
source: project-local
risk: low
---

# AM Clínica — Contexto del Proyecto

Sos un agente de desarrollo trabajando en AM Clínica, sistema de gestión para clínica odontológica.
Lee todo esto antes de escribir cualquier código.

## Stack
- Next.js 16 App Router + React 19 + TypeScript 5
- Supabase (PostgreSQL + RLS + Auth Google OAuth)
- Tailwind CSS 4, Framer Motion, Sonner (toasts)
- Resend (email), Twilio (WhatsApp), Google Drive/Sheets/Calendar

## Reglas críticas — NO negociables

### 1. Cliente Supabase
- Componentes cliente → `createClient()` de `utils/supabase/client.ts`
- Server actions/components → `createClient()` de `utils/supabase/server.ts`
- Admin (service role) → `createAdminClient()` de `utils/supabase/admin.ts`
- **NUNCA** importar de `lib/supabase.ts` — raw client sin sesión, rompe RLS silenciosamente
- Si los datos "no aparecen" aunque existen en la DB: este es el primer lugar a revisar

### 2. La columna de rol se llama `categoria`, no `role`
- Tabla `profiles`: columnas `(id, full_name, categoria, email)`
- Función SQL: `get_my_role()` → hace `SELECT categoria FROM profiles WHERE id = auth.uid()`
- En cualquier SQL nuevo: usar `get_my_role()` o `profiles.categoria`
- **NUNCA** escribir `profiles.role` — no existe en la DB live
- Jerarquía: `owner > admin > reception > developer > odontologo > asistente > laboratorio > partner_viewer`

### 3. Fechas y timezone (Argentina UTC-3)
- `new Date('YYYY-MM-DD')` parsea UTC → da el día ANTERIOR en Argentina
- Siempre parsear así:
  ```ts
  const [y, m, d] = str.split('-').map(Number);
  new Date(y, m-1, d); // local time
  ```

### 4. Migraciones de schema
- Todo cambio de schema → archivo en `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`
- Nunca modificar la DB directamente desde el dashboard sin migration versionada
- Cambios en tablas compartidas (`profiles`, `pacientes`, RLS) se coordinan antes de ejecutar

### 5. Server Actions
- Van en `app/actions/` — no crear API routes para CRUD
- Acciones con datos sensibles deben verificar auth explícitamente:
  ```ts
  const supabase = await createClient() // de utils/supabase/server.ts
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  ```

### 6. Archivos que NO se tocan sin coordinar
- `utils/supabase/` — cualquier archivo
- `utils/supabase/middleware.ts` — auth routing
- Funciones SQL compartidas: `get_my_role()`, `is_admin_or_owner()`
- Schema de tablas existentes (ALTER TABLE, DROP COLUMN, RENAME)

## Arquitectura clave
- Server Actions en `app/actions/` para la mayoría del CRUD
- API routes solo para: webhooks, cron jobs, integraciones externas
- RLS activo en TODAS las tablas — queries sin sesión devuelven vacío sin error
- Tabla pacientes: `pacientes` (id_paciente, nombre, apellido, email, telefono)
- Tabla turnos: `agenda_appointments` (doctor_id → profiles.id, patient_id → pacientes.id_paciente)

## Pitfalls conocidos
- JSDoc con `*/` en comentarios rompe TypeScript — evitar ese patrón
- FullCalendar Resource View requiere licencia Premium — no usar, hay implementación custom con CSS grid
- `createAdminClient()` retorna un Proxy si faltan env vars (build-safe) — ok en API routes
