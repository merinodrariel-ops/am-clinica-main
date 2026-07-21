# Ownership Map — am-clinica-main

> El ownership es **por tarea, no por carpeta**.
> AM actúa como PM/orquestador y asigna el owner de cada tarea al inicio.
> La calidad la garantizan los guardrails + CI, no un dueño fijo.

---

## Modelo de ownership rotativo

Cada tarea tiene exactamente:
- **Task Owner (actual):** el agente que la tomó
- **Next Owner (handoff):** quién la recibe al terminar
- **DoD:** condiciones que deben estar verificadas antes de hacer handoff

Ejemplo:
```
Task: Sync planes_financiacion post-pago de cuota
Task Owner: agente-A (sesión 2026-03-05)
Next Owner: agente-B (o libre para siguiente sesión)
DoD: build ✅, flujo UI validado, handoff escrito
```

---

## Rutas críticas — revisión humana obligatoria (AM decide)

Independientemente de quién sea el task owner, estas rutas requieren aprobación explícita de AM antes de ejecutar en producción:

| Ruta | Motivo |
|---|---|
| `contexts/AuthContext.tsx` | Afecta sesión de todos los usuarios |
| `utils/supabase/middleware.ts` | Controla acceso a todas las rutas protegidas |
| `supabase/migrations/**` | Cambios de schema irreversibles |
| `app/actions/user-management.ts` | Crea/modifica/elimina usuarios |
| Cualquier política RLS o trigger | Errores silenciosos pueden exponer datos |
| Push a main con CI roto | Producción |

---

## Decisiones que solo toma AM

- Agregar o eliminar roles/categorías de `WorkerCategory`
- Cambiar reglas de liquidación o modelo de pago
- Modificar permisos de visibilidad entre profesionales
- Ejecutar migraciones destructivas en producción
- Integrar nuevos proveedores externos
- Cambiar estructura de `planes_financiacion`
- Asignar o reasignar task owners en trabajo paralelo

---

## Protocolo de lock de módulo (para trabajo paralelo)

Cuando un agente empieza a trabajar, declarar el lock al inicio:

```
🔒 LOCK: [módulo/archivo] — agente-X — [timestamp]
Tarea: [descripción breve]
```

Al terminar, liberar:

```
🔓 UNLOCK: [módulo/archivo] — agente-X — [timestamp]
Estado: DONE / BLOQUEADO / PARCIAL
Handoff: [link o descripción]
```

Esto previene que dos agentes editen el mismo archivo en paralelo y generen conflictos de merge.

## Protocolo anti-regresión multi-agente

El lock por archivo no alcanza cuando dos tareas distintas comparten un contrato funcional. Antes de editar, el agente debe identificar el dominio real, no solo el archivo.

Regla:
- Si dos tareas afectan el mismo dominio funcional, se coordinan como si tocaran el mismo módulo.
- El agente que llega después debe preservar explícitamente los commits recientes del agente anterior.
- Si Git no marca conflicto pero el diff reintroduce comportamiento viejo, es regresión igual.

Checklist obligatorio antes de commit:
- [ ] `git fetch` ejecutado.
- [ ] `git status --short` revisado.
- [ ] `git log --oneline -- <archivos tocados>` revisado.
- [ ] Diff final comparado contra la tarea pedida.
- [ ] Contratos compartidos del dominio preservados.

### Zona caliente: Fotos / Drive / Photo Studio

Dominio funcional compartido:
- Grilla principal de fotos
- Portada
- Fotos de Selección / Redes
- Guardado de foto editada
- Orden manual por drag
- Photo Studio modal y herramientas de edición
- Thumbnails, cache y prefetch

Contrato vigente:
- La grilla debe mostrar **portada → Selección → resto**.
- La portada se define por el primer elemento del orden guardado.
- Las fotos de Selección se muestran dentro de la grilla principal, no como sección relegada al final.
- Cambios en herramientas del editor no deben modificar orden/portada/Selección.
- Cambios en orden/portada/Selección no deben modificar herramientas del editor.

Archivos típicos del dominio:
- `components/patients/drive/PatientDriveTab.tsx`
- `components/patients/drive/DriveFileCard.tsx`
- `components/patients/drive/PhotoStudioModal.tsx` y módulos derivados
- `app/actions/patient-files-drive.ts`

Si Cloud Code, Codex u otro agente toca cualquiera de esos archivos, debe revisar commits recientes de todos los archivos del dominio que puedan compartir contrato.

---

## Módulos de alta sensibilidad (doble revisión antes de push)

Aunque el owner rote, estos módulos siempre requieren:
1. Build limpio
2. Validación de flujo completo (no solo el archivo tocado)
3. Handoff con evidencia

| Módulo | Por qué |
|---|---|
| Auth / login | Login roto = todos los usuarios afuera |
| Caja recepción | Pagos de pacientes — dato financiero crítico |
| Liquidaciones | Cálculo de honorarios — dato sensible |
| Prestaciones | Privacidad inter-profesional |
| RLS / migrations | Seguridad de datos |
| Fotos / Drive / Photo Studio | Flujo grande y multi-agente; fácil revertir portada, Selección, guardado o editor sin conflicto textual |

---

## Template de tarea (para AM al asignar)

```markdown
## Tarea — [título] — [fecha]

**Task Owner:** [agente]
**Módulo:** [nombre]
**Archivos esperados:** [lista]
**Prioridad:** alta / media / baja
**Requiere aprobación humana:** sí / no

**Descripción:**
[qué hay que hacer y por qué]

**DoD:**
- [ ] Build pasa
- [ ] Flujo validado
- [ ] Handoff escrito
- [ ] Push hecho (si aplica)

**Next Owner:** [agente o "libre"]
```
