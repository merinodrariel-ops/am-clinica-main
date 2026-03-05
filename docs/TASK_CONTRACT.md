# Task Contract — am-clinica-main

> Completar este contrato al inicio de cualquier tarea no trivial.
> Especialmente obligatorio cuando hay múltiples agentes trabajando en paralelo.

---

## Cómo usar este template

1. Copiar la sección **Contract** al inicio del trabajo
2. Definir scope y DoD antes de escribir una línea de código
3. Al terminar, completar la sección **Handoff Output**
4. Dejar el handoff visible para el próximo agente

---

## Contract

```markdown
### Task Contract — [título breve] — [fecha]

**Goal:** [qué problema resuelve, en una oración]

**In scope:**
- [item 1]
- [item 2]

**Out of scope:**
- [item 1 — importante para evitar scope creep]

**Módulo owner:** ver docs/OWNERSHIP.md — ¿está libre?

**Constraints:**
- No romper módulos adyacentes: [listar]
- Sin migraciones destructivas
- [otras restricciones del negocio]

**Requiere aprobación humana para:**
- [ ] Migración SQL en producción
- [ ] Cambios a RLS/triggers
- [ ] Cambios a AuthContext o middleware
- [ ] Push a main sin CI

**Archivos probablemente afectados:**
- [path/to/file.tsx — motivo]

**Risk level:** bajo / medio / alto

**Definition of Done:**
- [ ] Funcionalidad implementada
- [ ] Build pasa (`npm run build`)
- [ ] Sin violaciones de guardrails (categoria, cliente Supabase, timezone)
- [ ] Probado en UI o con query SQL
- [ ] Handoff output completado
```

---

## Handoff Output

```markdown
### Handoff Output — [título] — [fecha]

**Estado final:** DONE / BLOQUEADO / PARCIAL

**Archivos tocados:**
- path/to/file.tsx (descripción del cambio)

**Qué cambió y por qué:**
[explicación breve]

**Risks encontrados:**
[ninguno / descripción + mitigación aplicada]

**Por qué es seguro:**
[razón]

**Validación ejecutada:**
- `npm run build` → ✅ / ❌
- [SQL / test UI / otro] → resultado

**Trabajo restante:**
- [ninguno / lista de follow-ups]

**Próximo agente recomendado:**
- Tipo: [frontend / fullstack / DB / auth]
- Acción: [descripción]
```

---

## Ejemplos de scope bien definido

### ✅ Bien definido
```
Goal: Que el pago de cuota en caja de recepción actualice planes_financiacion
In scope: NuevoIngresoForm.tsx — agregar update post-insert
Out of scope: UI de FinanciacionTab, lógica de liquidaciones
Risk: bajo — solo agrega código, no modifica lógica existente
```

### ❌ Mal definido (scope creep garantizado)
```
Goal: Mejorar el flujo de pagos
In scope: todo lo relacionado a pagos
```

---

## Flags de escalada

Escalar a humano si:
- El cambio afecta auth/login de todos los usuarios
- Se necesita DROP o DELETE masivo
- Hay conflicto entre dos agentes sobre el mismo módulo
- El build falla y la causa no está clara
- La tarea original cambió de scope en más de un 50%
