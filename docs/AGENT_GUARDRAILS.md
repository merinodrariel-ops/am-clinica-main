# Agent Guardrails — am-clinica-main

> Leer antes de cualquier cambio de código. Sin excepción.

---

## 0. Contexto obligatorio (leer en este orden)

1. `/Users/am/.claude/projects/-Users-am-Downloads-antigravity-apps-am-clinica-main/memory/MEMORY.md`
2. `CLAUDE.md` (raíz del proyecto)
3. `docs/AGENT_ROUTING.md`
4. `docs/TASK_CONTRACT.md`

---

## 1. Reglas de mayor prioridad (críticas)

### ❌ Nunca afirmar "listo" sin validación

Un cambio está terminado cuando:
- El build pasa (`npm run build`)
- No hay errores TS en archivos tocados
- Se probó el flujo en UI o con query SQL
- Se entregó el formato de handoff completo

### ❌ Nunca usar `profiles.role`

La columna se llama `profiles.categoria`. Fue renombrada manualmente en Supabase.
PostgreSQL no actualiza funciones/triggers al renombrar — quedaron rotos silenciosamente.

- En SQL: `profiles.categoria` o `get_my_role()`
- En TypeScript: `useAuth().categoria` o `worker.categoria`
- En RLS policies: `get_my_role()` — nunca `auth.jwt() ->> 'role'`

---

## 2. Supabase Client — regla por contexto

| Contexto | Import correcto |
|---|---|
| Client component / browser | `import { createClient } from '@/utils/supabase/client'` |
| Server Action / Server Component | `import { createClient } from '@/utils/supabase/server'` |
| API route / webhook / cron | `import { createAdminClient } from '@/utils/supabase/admin'` |

**NUNCA usar `@/lib/supabase`** — ese archivo no exporta `supabase` en producción. Solo es para tipos.

**Síntoma de client mismatch:** registros que existen en DB pero no aparecen en UI. Causa: cliente raw no comparte sesión con SSR, RLS oculta los registros.

---

## 3. `useAuth()` — desestructuración correcta

```ts
// ✅ Correcto
const { categoria } = useAuth()
const { categoria: role } = useAuth()   // alias local si preferís "role"

// ❌ Incorrecto — 'role' no existe en AuthContextType
const { role } = useAuth()
```

---

## 4. `WorkerProfile` — campos correctos

```ts
worker.categoria   // ✅ (era worker.rol — eliminado)
worker.area        // ✅
// worker.rol      // ❌ no existe
```

---

## 5. Bug de timezone (Argentina = UTC-3)

```ts
// ❌ Incorrecto — new Date('2026-03-05') = 2026-03-04T21:00 en AR
new Date('2026-03-05')

// ✅ Correcto — parseo local explícito
const [y, m, d] = str.split('-').map(Number);
const localDate = new Date(y, m - 1, d);
```

---

## 6. Tipos correctos de registros

| Tipo | Campos válidos |
|---|---|
| `ProductRecord` | `notes` (barcode/desc), `link` (QR/URL) — NO `barcode`, `qr_code`, `is_active` |
| `StockMovementRecord` | `tipo_movimiento`, `cantidad`, `motivo`, `usuario`, `item` — NO `type`, `qty`, `note` |
| `WorkerProfile` | `categoria`, `area` — NO `rol` |

---

## 7. Reglas de negocio críticas (NO asumir lo contrario)

- **Sin porcentajes:** no existe liquidación por %. Nunca proponer ni implementar.
- **Carga de prestaciones:** solo asistentes. Los odontólogos son read-only.
- **Privacidad inter-profesional:** un odontólogo nunca ve montos ni prestaciones de colegas.
- **`planes_financiacion`:** los campos `cuotas_pagadas` y `saldo_restante_usd` NO se actualizan automáticamente vía DB. El código en `NuevoIngresoForm.tsx` los actualiza tras cada pago de cuota.

---

## 8. Cambios que requieren aprobación humana

- Cualquier migración SQL en producción
- Cambios a RLS policies o triggers
- Cambios a `contexts/AuthContext.tsx` o middleware
- Cualquier operación destructiva (DROP, DELETE masivo, reset de RLS)
- Push a main sin CI

---

## 9. Checklist pre-entrega

- [ ] Contexto obligatorio leído (sección 0)
- [ ] No se usa `profiles.role` en ningún lugar nuevo
- [ ] Cliente Supabase correcto según contexto de runtime
- [ ] No se usa `new Date('YYYY-MM-DD')` para fechas locales
- [ ] No se usa `useAuth().role` (usar `.categoria`)
- [ ] No se usa `worker.rol` (usar `.categoria`)
- [ ] Build pasa sin errores TS
- [ ] Entrega en formato handoff completo

---

## 10. Formato de handoff obligatorio

```
## Handoff

**Files changed:** [lista]
**Risks found:** [descripción o "ninguno"]
**Why safe:** [razón]
**Validation:**
  - Comando: `...`
  - Resultado: `...`
**Follow-ups:** [lista o "ninguno"]
```
