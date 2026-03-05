# Agent Routing — am-clinica-main

> Usar este mapa para asignar tareas al agente correcto desde el principio.
> Leer siempre junto con `docs/AGENT_GUARDRAILS.md`.

---

## Módulos y rutas de agente

### UI / Componentes visuales
- **Scope:** `app/**/*.tsx`, `components/**/*.tsx`, Tailwind, animaciones, copy
- **Agente:** frontend
- **Validar:** responsive, dark mode, sin regresiones visuales en pantallas tocadas
- **No tocar:** lógica de negocio, RLS, server actions

### Server Actions y lógica de negocio
- **Scope:** `app/actions/**`, permisos por `categoria`, reglas de cálculo
- **Agente:** backend/fullstack
- **Validar:** paths de error y éxito, permisos por `categoria` (`owner/admin/reception/...`)
- **No tocar:** RLS directamente — coordinar con agente DB si se necesitan cambios de permisos

### Supabase DB — schema, RLS, funciones SQL
- **Scope:** `supabase/migrations/**`, triggers, functions, policies
- **Agente:** DB/security
- **Validar:** nunca `profiles.role`, solo `profiles.categoria` o `get_my_role()`; testear policies con `SET ROLE`
- **Requiere:** aprobación humana antes de ejecutar en producción

### Auth / sesión / roles
- **Scope:** `contexts/AuthContext.tsx`, `utils/supabase/middleware.ts`, guards de ruta
- **Agente:** auth specialist
- **Validar:** normalización de aliases (`administradora` → `admin`), rutas protegidas, `categoria` correcto post-login
- **Requiere:** aprobación humana — cambio de auth puede romper login de todos los usuarios

### Integraciones / webhooks / cron
- **Scope:** `app/api/**`, Resend, Twilio, Google APIs, Calendly
- **Agente:** integrations/backend
- **Validar:** env vars presentes, signature checks, idempotencia (mismo evento dos veces no duplica datos)

### CI / deploy / Vercel
- **Scope:** `.github/**`, `vercel.json`, build pipeline
- **Agente:** devops/release
- **Validar:** build limpio, no hay secrets expuestos, rollback definido

---

## Mapa de módulos específicos

| Módulo | Archivos principales | Agente recomendado |
|---|---|---|
| Caja recepción | `components/caja/NuevoIngresoForm.tsx`, `lib/caja-recepcion.ts` | fullstack |
| Caja admin | `app/caja-admin/**`, `components/caja-admin/**`, `lib/caja-admin/**` | fullstack |
| Agenda | `app/agenda/**`, `components/agenda/**`, `lib/am-scheduler/**` | fullstack |
| Pacientes | `app/patients/**`, `components/patients/**`, `lib/patients.ts` | fullstack |
| Inventario (clásico) | `app/inventario/**`, `components/inventario/**` | frontend/fullstack |
| Inventario (productos) | `app/inventario/productos/**`, `components/inventario-products/**` | frontend/fullstack |
| Portal profesional | `app/portal/**`, `app/portal-profesional/**`, `components/portal/**` | frontend |
| Prestaciones | `app/admin/prestaciones/**`, `app/actions/prestaciones.ts` | fullstack |
| Liquidaciones | `app/admin/liquidaciones/**`, `app/actions/liquidaciones.ts` | fullstack |
| Auth & perfiles | `contexts/AuthContext.tsx`, `utils/supabase/**`, `app/actions/user-management.ts` | auth specialist |
| Staff / Personal | `app/admin/staff/**`, `components/admin/**` | fullstack |
| Admisión | `app/admision/**`, `components/admission/**` | fullstack |

---

## Reglas de coordinación multi-agente

1. **Un módulo, un agente a la vez.** Ver `docs/OWNERSHIP.md` antes de comenzar.
2. **Si tocás SQL/RLS, coordiná** con el agente DB — no hacer migraciones ad-hoc.
3. **Si tocás `AuthContext` o middleware,** pedir aprobación humana explícita.
4. **Handoff obligatorio al terminar** — usar el formato de `docs/AGENT_GUARDRAILS.md §10`.

---

## Template de handoff entre agentes

```markdown
## Handoff — [módulo] — [fecha]

**Tarea completada:** [descripción breve]
**Estado:** DONE / BLOQUEADO / PARCIAL

**Archivos tocados:**
- path/to/file.tsx (motivo)

**Estado que dejé:**
- [qué funciona ahora]
- [qué quedó pendiente]

**Bloqueadores activos:**
- [ninguno / descripción]

**Próxima acción recomendada:**
- [agente tipo X debería hacer Y]

**Validación ejecutada:**
- `npm run build` → ✅
- [query SQL / test de UI]
```
