# Prompt Maestro para Agentes — am-clinica-main

> Copiar y pegar este prompt al inicio de cualquier sesión de agente en este proyecto.
> Garantiza que el agente lea el contexto correcto antes de tocar código.

---

## Prompt (copy/paste)

```
ANTES DE HACER CUALQUIER CAMBIO EN am-clinica-main:

1) LEÉ CONTEXTO OBLIGATORIO (en este orden):
   - /Users/ariel/.claude/projects/-Users-am-Downloads-antigravity-apps-am-clinica-main/memory/MEMORY.md
   - CLAUDE.md (raíz del proyecto)
   - docs/AGENT_GUARDRAILS.md
   - docs/AGENT_ROUTING.md
   - docs/OWNERSHIP.md
   - docs/TASK_CONTRACT.md

2) REGLAS CRÍTICAS (sin excepción):
   - Nunca usar profiles.role → usar profiles.categoria o get_my_role()
   - Nunca usar useAuth().role → usar useAuth().categoria
   - Nunca usar worker.rol → usar worker.categoria
   - Cliente browser: @/utils/supabase/client
   - Server actions/components: @/utils/supabase/server
   - API routes/webhooks: @/utils/supabase/admin
   - NUNCA importar de @/lib/supabase en client components
   - Evitar new Date('YYYY-MM-DD') — bug de timezone UTC-3 (ver CLAUDE.md)
   - ProductRecord: campos son notes y link, NO barcode/qr_code/is_active
   - Sin porcentajes en liquidación — regla de negocio irrompible

3) FLUJO DE TRABAJO:
   - Verificar OWNERSHIP.md: ¿el módulo que voy a tocar está libre?
   - Definir scope y DoD con TASK_CONTRACT antes de implementar
   - Elegir agente según AGENT_ROUTING según el tipo de cambio
   - Si tocás SQL/RLS/Auth → pedir aprobación humana explícita

4) FORMATO DE ENTREGA OBLIGATORIO:
   - Files changed (con motivo)
   - Risks found (o "ninguno")
   - Why safe (razón concreta)
   - Validation: comandos ejecutados + resultados
   - Follow-ups (o "ninguno")

5) NO ROMPER PRODUCCIÓN:
   - No cambios destructivos sin aprobación
   - No migraciones sin revisión humana
   - No afirmar "listo" sin haber validado el build y el flujo
   - No hacer push a main si el build falla
```

---

## Versión corta (para tareas simples)

```
Proyecto: am-clinica-main
Leer antes de codear: CLAUDE.md + docs/AGENT_GUARDRAILS.md
Regla #1: profiles.categoria (no .role), useAuth().categoria (no .role)
Regla #2: cliente Supabase correcto por contexto (client/server/admin)
Regla #3: no new Date('YYYY-MM-DD') — timezone bug AR
Entregar: files changed + risks + validation + follow-ups
```

---

## Cuándo usar la versión larga vs corta

| Tarea | Versión |
|---|---|
| Bug fix en un componente visual | Corta |
| Nueva feature en módulo existente | Larga |
| Cambio que toca server actions | Larga |
| Cualquier cambio de SQL/RLS/Auth | Larga + aprobación humana |
| Hotfix urgente de producción | Corta, pero con handoff completo |
| Trabajo multi-agente en paralelo | Larga + OWNERSHIP.md |

---

## Checklist de inicio de sesión

- [ ] Leí MEMORY.md
- [ ] Leí CLAUDE.md
- [ ] Leí AGENT_GUARDRAILS.md
- [ ] Verifiqué OWNERSHIP.md — módulo libre
- [ ] Completé el Task Contract
- [ ] Sé qué archivos voy a tocar y por qué
