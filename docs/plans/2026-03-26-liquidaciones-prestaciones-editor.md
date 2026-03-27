# Liquidaciones — Editor de Prestaciones en Detalle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dentro del detalle expandido de una liquidación generada (modelo `prestacion_usd`), permitir al owner/admin agregar, editar y eliminar prestaciones individuales (`prestaciones_realizadas`), recalculando automáticamente los totales de la liquidación sin alterar su estado.

**Architecture:**
- Nuevas server actions en `liquidaciones.ts` para CRUD de `prestaciones_realizadas` + recálculo de totales en `liquidaciones_mensuales` (sin tocar `estado`).
- Nuevo componente `PrestacionesDetallePanel` que reemplaza los 4 stat-cards actuales del expanded row cuando el modelo es `prestacion_usd`.
- `LiquidacionesClient.tsx` carga las prestaciones vivas al expandir y pasa los handlers al panel.

**Tech Stack:** Next.js 16 App Router, Supabase admin client, TypeScript, Tailwind CSS, Sonner (toasts)

---

## Contexto clave del codebase

### Tablas relevantes
- `prestaciones_realizadas`: `{ id, profesional_id, prestacion_nombre, fecha_realizacion, monto_honorarios (USD), slides_url, slides_validado, created_at }`
- `liquidaciones_mensuales`: `{ id, personal_id, mes (YYYY-MM-01), total_usd, total_ars, tc_liquidacion, prestaciones_validadas, prestaciones_pendientes, breakdown (JSONB), estado, ... }`

### Lógica de cálculo existente (en `generateLiquidacion`)
- `withSlides = prestaciones.filter(p => p.slides_url)` → suma `monto_honorarios` → `total_usd`
- `total_ars = total_usd * tc_bna_venta`
- El breakdown almacena arrays `con_slides[]` y `sin_slides[]` con los detalles
- **IMPORTANTE:** `generateLiquidacion` resetea el `estado` a 'pending' via upsert. NO llamar esa función después de editar — usar la nueva acción `recalcularTotalesLiquidacion` que preserva el estado.

### Expanded row actual (`LiquidacionesClient.tsx` ~línea 2548)
```tsx
{liq && isExpanded && (
  <tr className="bg-slate-950/60">
    <td colSpan={6} className="px-4 py-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        {/* 4 stat cards: TC, Precio, Cantidad, Observaciones */}
      </div>
    </td>
  </tr>
)}
```

### Admin client pattern (usado en este archivo)
```typescript
function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}
```

---

## Archivos a crear/modificar

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `app/actions/liquidaciones.ts` | Modificar | +3 server actions: getPrestacionesDelMes, upsertPrestacion, deletePrestacion, recalcularTotalesLiquidacion |
| `components/admin/liquidaciones/PrestacionesDetallePanel.tsx` | Crear | UI: tabla de prestaciones con inline add/edit/delete |
| `app/admin/liquidaciones/LiquidacionesClient.tsx` | Modificar | Importar panel, cargar prestaciones al expandir, reemplazar stat-cards para prestacion_usd |

---

## Task 1: Server Actions — CRUD de prestaciones + recálculo

**Archivo:** `app/actions/liquidaciones.ts`

### Tipos a agregar (al final de la sección TYPES)

```typescript
export interface PrestacionRealizada {
    id: string;
    profesional_id: string;
    prestacion_nombre: string;
    fecha_realizacion: string;
    monto_honorarios: number;
    slides_url: string | null;
}

export interface UpsertPrestacionInput {
    id?: string;           // si undefined → INSERT, si presente → UPDATE
    profesional_id: string;
    prestacion_nombre: string;
    fecha_realizacion: string;   // 'YYYY-MM-DD'
    monto_honorarios: number;    // USD
    slides_url?: string | null;
}
```

### Action 1: getPrestacionesDelMes

```typescript
export async function getPrestacionesDelMes(
    personalId: string,
    mes: string   // 'YYYY-MM'
): Promise<PrestacionRealizada[]> {
    const admin = getAdminClient();
    const [y, m] = mes.split('-').map(Number);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await admin
        .from('prestaciones_realizadas')
        .select('id, profesional_id, prestacion_nombre, fecha_realizacion, monto_honorarios, slides_url')
        .eq('profesional_id', personalId)
        .gte('fecha_realizacion', startDate)
        .lte('fecha_realizacion', endDate)
        .order('fecha_realizacion', { ascending: true });

    if (error) throw error;
    return (data || []) as PrestacionRealizada[];
}
```

### Action 2: upsertPrestacion

```typescript
export async function upsertPrestacion(
    input: UpsertPrestacionInput
): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        if (input.id) {
            // UPDATE
            const { error } = await admin
                .from('prestaciones_realizadas')
                .update({
                    prestacion_nombre: input.prestacion_nombre,
                    fecha_realizacion: input.fecha_realizacion,
                    monto_honorarios: input.monto_honorarios,
                    slides_url: input.slides_url ?? null,
                })
                .eq('id', input.id);
            if (error) throw error;
        } else {
            // INSERT
            const { error } = await admin
                .from('prestaciones_realizadas')
                .insert({
                    profesional_id: input.profesional_id,
                    prestacion_nombre: input.prestacion_nombre,
                    fecha_realizacion: input.fecha_realizacion,
                    monto_honorarios: input.monto_honorarios,
                    slides_url: input.slides_url ?? null,
                });
            if (error) throw error;
        }
        revalidatePath('/admin/liquidaciones');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}
```

### Action 3: deletePrestacion

```typescript
export async function deletePrestacion(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const { error } = await admin
            .from('prestaciones_realizadas')
            .delete()
            .eq('id', id);
        if (error) throw error;
        revalidatePath('/admin/liquidaciones');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}
```

### Action 4: recalcularTotalesLiquidacion

Recalcula totals a partir de `prestaciones_realizadas` actuales, actualiza `liquidaciones_mensuales` **sin tocar `estado`**.

```typescript
export async function recalcularTotalesLiquidacion(
    liquidacionId: string,
    personalId: string,
    mes: string  // 'YYYY-MM'
): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const tcBnaVenta = await fetchBnaVenta();

        const prestaciones = await getPrestacionesDelMes(personalId, mes);
        const withSlides = prestaciones.filter(p => p.slides_url);
        const withoutSlides = prestaciones.filter(p => !p.slides_url);

        const rawUsd = withSlides.reduce((s, p) => s + Number(p.monto_honorarios || 0), 0);
        const totalUsd = Math.round(rawUsd * 100) / 100;
        const totalArs = Math.round(rawUsd * tcBnaVenta * 100) / 100;

        const breakdown = {
            con_slides: withSlides.map(p => ({
                id: p.id,
                descripcion: p.prestacion_nombre,
                monto_usd: p.monto_honorarios,
                fecha: p.fecha_realizacion,
            })),
            sin_slides: withoutSlides.map(p => ({
                id: p.id,
                descripcion: p.prestacion_nombre,
                monto_usd: p.monto_honorarios,
                fecha: p.fecha_realizacion,
            })),
            tc_bna_venta: tcBnaVenta,
            total_usd: totalUsd,
            total_ars: totalArs,
        };

        const { error } = await admin
            .from('liquidaciones_mensuales')
            .update({
                total_usd: totalUsd,
                total_ars: totalArs,
                tc_liquidacion: tcBnaVenta,
                prestaciones_validadas: withSlides.length,
                prestaciones_pendientes: withoutSlides.length,
                breakdown,
                updated_at: new Date().toISOString(),
            })
            .eq('id', liquidacionId);

        if (error) throw error;
        revalidatePath('/admin/liquidaciones');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}
```

### Steps

- [ ] **Step 1.1:** Abrir `app/actions/liquidaciones.ts`, agregar los 4 tipos/actions al final del archivo (después de `checkAndAwardBadges`). No modificar nada existente.
- [ ] **Step 1.2:** Verificar que TypeScript compile sin errores: `npm run build 2>&1 | grep -E "error TS|Type error|✓"`.
- [ ] **Step 1.3:** Commit: `git add app/actions/liquidaciones.ts && git commit -m "feat(liquidaciones): CRUD actions para prestaciones_realizadas + recálculo"`

---

## Task 2: Componente PrestacionesDetallePanel

**Archivo a crear:** `components/admin/liquidaciones/PrestacionesDetallePanel.tsx`

Este componente recibe la lista de prestaciones, el estado de la liquidación, y callbacks para las operaciones. Maneja su propio estado local de edición.

### Props interface

```typescript
interface Props {
    liquidacionId: string;
    personalId: string;
    mes: string;               // 'YYYY-MM'
    prestaciones: PrestacionRealizada[];
    liquidacionEstado: string; // 'pending' | 'approved' | 'paid' | 'rejected'
    tc: number;
    onRefresh: () => void;     // llamar tras cualquier cambio para recargar datos
}
```

### Estructura visual

```
┌─────────────────────────────────────────────────────────────────┐
│ PRESTACIONES DEL MES          [+ Agregar prestación]            │
├───────────────────┬────────────┬──────────┬──────────────────────┤
│ Prestación        │ Fecha      │ Monto USD│ Slides  │ Acciones  │
├───────────────────┼────────────┼──────────┼─────────┼────────────┤
│ Corona cerámica   │ 15/03      │ USD 120  │ ✓       │ ✏️  🗑️    │
│ Extracción simple │ 22/03      │ USD 80   │ ⚠️ sin  │ ✏️  🗑️    │
├───────────────────┴────────────┴──────────┴─────────┴────────────┤
│ Total validado: USD 120 → ARS 138.000   Total pendiente: USD 80  │
└─────────────────────────────────────────────────────────────────┘
```

### Estado interno del componente

```typescript
const [editingId, setEditingId] = useState<string | null>(null);  // null = no editing
const [addingNew, setAddingNew] = useState(false);
const [saving, setSaving] = useState(false);
const [form, setForm] = useState<EditForm>({ nombre: '', fecha: '', monto: '', slides_url: '' });

interface EditForm {
    nombre: string;
    fecha: string;     // YYYY-MM-DD
    monto: string;     // string para permitir decimales al tipear
    slides_url: string;
}
```

### Lógica de edición inline

- Al hacer click en ✏️: `setEditingId(p.id); setForm({ nombre: p.prestacion_nombre, fecha: p.fecha_realizacion, monto: String(p.monto_honorarios), slides_url: p.slides_url || '' })`
- Al guardar: llamar `upsertPrestacion({ id: editingId, ... })` → si ok: `onRefresh()` → `setEditingId(null)`
- Cancelar: `setEditingId(null)`

### Lógica de nueva prestación

- Al hacer click en "+ Agregar": `setAddingNew(true); setForm({ nombre: '', fecha: defaultDate, monto: '', slides_url: '' })`
  - `defaultDate` = primer día del mes (ej: '2026-03-01')
- Al guardar: llamar `upsertPrestacion({ profesional_id, ... })` → si ok: `onRefresh()` → `setAddingNew(false)`

### Lógica de eliminación

- Al hacer click en 🗑️: `if (confirm('¿Eliminar esta prestación?'))` → `deletePrestacion(id)` → `onRefresh()`

### Guardar = recalcular

En `onRefresh` del padre: refetch prestaciones + llamar `recalcularTotalesLiquidacion`. Ver Task 3.

### Código completo del componente

```typescript
'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
    upsertPrestacion,
    deletePrestacion,
    recalcularTotalesLiquidacion,
    type PrestacionRealizada,
} from '@/app/actions/liquidaciones';

interface EditForm {
    nombre: string;
    fecha: string;
    monto: string;
    slides_url: string;
}

interface Props {
    liquidacionId: string;
    personalId: string;
    mes: string;
    prestaciones: PrestacionRealizada[];
    liquidacionEstado: string;
    tc: number;
    onRefresh: () => void;
}

function formatUSD(n: number) {
    return `USD ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function formatARS(n: number) {
    return `ARS ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function saveAndRecalculate(
    action: () => Promise<{ success: boolean; error?: string }>,
    liquidacionId: string,
    personalId: string,
    mes: string,
    onRefresh: () => void,
    setSaving: (v: boolean) => void,
) {
    setSaving(true);
    try {
        const res = await action();
        if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
        const recalc = await recalcularTotalesLiquidacion(liquidacionId, personalId, mes);
        if (!recalc.success) toast.warning('Guardado pero no se pudo recalcular totales');
        onRefresh();
    } finally {
        setSaving(false);
    }
}

export default function PrestacionesDetallePanel({
    liquidacionId, personalId, mes, prestaciones, tc, onRefresh,
}: Props) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const defaultDate = `${mes}-01`;
    const emptyForm: EditForm = { nombre: '', fecha: defaultDate, monto: '', slides_url: '' };
    const [form, setForm] = useState<EditForm>(emptyForm);

    const withSlides = prestaciones.filter(p => p.slides_url);
    const withoutSlides = prestaciones.filter(p => !p.slides_url);
    const totalUsd = withSlides.reduce((s, p) => s + Number(p.monto_honorarios), 0);
    const totalArs = totalUsd * tc;

    function startEdit(p: PrestacionRealizada) {
        setAddingNew(false);
        setEditingId(p.id);
        setForm({
            nombre: p.prestacion_nombre,
            fecha: p.fecha_realizacion,
            monto: String(p.monto_honorarios),
            slides_url: p.slides_url || '',
        });
    }

    function startAdd() {
        setEditingId(null);
        setAddingNew(true);
        setForm(emptyForm);
    }

    function cancelEdit() { setEditingId(null); setAddingNew(false); }

    async function handleSaveEdit() {
        if (!editingId) return;
        const monto = parseFloat(form.monto);
        if (!form.nombre.trim() || isNaN(monto) || monto <= 0) {
            toast.error('Completá nombre y monto válido');
            return;
        }
        await saveAndRecalculate(
            () => upsertPrestacion({
                id: editingId,
                profesional_id: personalId,
                prestacion_nombre: form.nombre.trim(),
                fecha_realizacion: form.fecha,
                monto_honorarios: monto,
                slides_url: form.slides_url.trim() || null,
            }),
            liquidacionId, personalId, mes, onRefresh, setSaving,
        );
        setEditingId(null);
    }

    async function handleSaveNew() {
        const monto = parseFloat(form.monto);
        if (!form.nombre.trim() || isNaN(monto) || monto <= 0) {
            toast.error('Completá nombre y monto válido');
            return;
        }
        await saveAndRecalculate(
            () => upsertPrestacion({
                profesional_id: personalId,
                prestacion_nombre: form.nombre.trim(),
                fecha_realizacion: form.fecha,
                monto_honorarios: monto,
                slides_url: form.slides_url.trim() || null,
            }),
            liquidacionId, personalId, mes, onRefresh, setSaving,
        );
        setAddingNew(false);
    }

    async function handleDelete(id: string, nombre: string) {
        if (!confirm(`¿Eliminar "${nombre}"?`)) return;
        await saveAndRecalculate(
            () => deletePrestacion(id),
            liquidacionId, personalId, mes, onRefresh, setSaving,
        );
    }

    const inputCls = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500 w-full';

    function InlineForm({ onSave }: { onSave: () => void }) {
        return (
            <tr className="bg-slate-800/60">
                <td className="px-3 py-2">
                    <input className={inputCls} placeholder="Nombre prestación" value={form.nombre}
                        onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                </td>
                <td className="px-3 py-2">
                    <input type="date" className={inputCls} value={form.fecha}
                        onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </td>
                <td className="px-3 py-2">
                    <input type="number" className={inputCls} placeholder="0.00" min="0" step="0.01"
                        value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
                </td>
                <td className="px-3 py-2">
                    <input className={inputCls} placeholder="URL slides (opcional)" value={form.slides_url}
                        onChange={e => setForm(f => ({ ...f, slides_url: e.target.value }))} />
                </td>
                <td className="px-3 py-2">
                    <div className="flex gap-1">
                        <button onClick={onSave} disabled={saving}
                            className="p-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-white disabled:opacity-50">
                            <Check size={12} />
                        </button>
                        <button onClick={cancelEdit}
                            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300">
                            <X size={12} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Prestaciones del mes</p>
                <button
                    onClick={startAdd}
                    disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 bg-violet-700/70 hover:bg-violet-700 text-white rounded text-xs transition-colors disabled:opacity-50"
                >
                    <Plus size={12} /> Agregar
                </button>
            </div>

            <div className="rounded-lg border border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-slate-900/80 text-slate-500 text-[10px] uppercase tracking-wider">
                            <th className="px-3 py-2 text-left">Prestación</th>
                            <th className="px-3 py-2 text-left">Fecha</th>
                            <th className="px-3 py-2 text-right">Monto USD</th>
                            <th className="px-3 py-2 text-center">Slides</th>
                            <th className="px-3 py-2 text-center w-16">Acc.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {prestaciones.map(p => (
                            editingId === p.id ? (
                                <InlineForm key={p.id} onSave={handleSaveEdit} />
                            ) : (
                                <tr key={p.id} className={`hover:bg-slate-800/30 transition-colors ${!p.slides_url ? 'opacity-60' : ''}`}>
                                    <td className="px-3 py-2 text-slate-200">{p.prestacion_nombre}</td>
                                    <td className="px-3 py-2 text-slate-400">
                                        {new Date(p.fecha_realizacion + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-white">
                                        {formatUSD(Number(p.monto_honorarios))}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {p.slides_url ? (
                                            <a href={p.slides_url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300">
                                                <LinkIcon size={10} /> ok
                                            </a>
                                        ) : (
                                            <span className="text-amber-400 text-[10px]">sin slides</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => startEdit(p)} disabled={saving}
                                                className="p-1 text-slate-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
                                                title="Editar">
                                                <Pencil size={11} />
                                            </button>
                                            <button onClick={() => handleDelete(p.id, p.prestacion_nombre)} disabled={saving}
                                                className="p-1 text-slate-400 hover:text-red-400 disabled:opacity-40 transition-colors"
                                                title="Eliminar">
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                        {addingNew && <InlineForm onSave={handleSaveNew} />}
                        {prestaciones.length === 0 && !addingNew && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-slate-600 text-xs">
                                    No hay prestaciones registradas para este mes. Hacé click en &quot;Agregar&quot;.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totales */}
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
                <div className="flex items-center gap-1.5 rounded bg-emerald-900/30 border border-emerald-800/40 px-3 py-1.5">
                    <span className="text-slate-500">Validado:</span>
                    <span className="font-semibold text-white">{formatUSD(totalUsd)}</span>
                    <span className="text-slate-500">→</span>
                    <span className="font-semibold text-emerald-300">{formatARS(totalArs)}</span>
                </div>
                {withoutSlides.length > 0 && (
                    <div className="flex items-center gap-1.5 rounded bg-amber-900/20 border border-amber-800/30 px-3 py-1.5">
                        <span className="text-amber-400">⚠ Pendiente (sin slides):</span>
                        <span className="font-semibold text-amber-300">
                            {formatUSD(withoutSlides.reduce((s, p) => s + Number(p.monto_honorarios), 0))}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
```

### Steps

- [ ] **Step 2.1:** Crear directorio si no existe: `mkdir -p components/admin/liquidaciones`
- [ ] **Step 2.2:** Crear `components/admin/liquidaciones/PrestacionesDetallePanel.tsx` con el código completo de arriba.
- [ ] **Step 2.3:** Build check: `npm run build 2>&1 | grep -E "error TS|Type error|✓"`
- [ ] **Step 2.4:** Commit: `git add components/admin/liquidaciones/PrestacionesDetallePanel.tsx && git commit -m "feat(liquidaciones): PrestacionesDetallePanel con CRUD inline"`

---

## Task 3: Integrar en LiquidacionesClient.tsx

**Archivo:** `app/admin/liquidaciones/LiquidacionesClient.tsx`

Este archivo es muy largo (~2600 líneas). Hacer cambios quirúrgicos y precisos.

### 3.1 — Imports a agregar (al inicio, junto a otros imports de actions)

```typescript
import PrestacionesDetallePanel from '@/components/admin/liquidaciones/PrestacionesDetallePanel';
import { getPrestacionesDelMes, type PrestacionRealizada } from '@/app/actions/liquidaciones';
```

### 3.2 — Estado a agregar (cerca de `expandedRow` ~línea 1399)

```typescript
// Estado para prestaciones del row expandido
const [prestacionesData, setPrestacionesData] = useState<Record<string, PrestacionRealizada[]>>({});
const [prestacionesLoading, setPrestacionesLoading] = useState<string | null>(null);
```

### 3.3 — Función para cargar prestaciones al expandir

Agregar DESPUÉS de `openDetalleHoras`:

```typescript
async function loadPrestacionesForRow(personalId: string, mes: string) {
    if (prestacionesData[personalId]) return; // ya cargadas
    setPrestacionesLoading(personalId);
    try {
        const data = await getPrestacionesDelMes(personalId, mes);
        setPrestacionesData(prev => ({ ...prev, [personalId]: data }));
    } catch {
        toast.error('No se pudieron cargar las prestaciones');
    } finally {
        setPrestacionesLoading(null);
    }
}

async function refreshPrestacionesForRow(personalId: string, mes: string) {
    setPrestacionesLoading(personalId);
    try {
        const data = await getPrestacionesDelMes(personalId, mes);
        setPrestacionesData(prev => ({ ...prev, [personalId]: data }));
        // También recargar las liquidaciones para reflejar nuevos totales
        await loadData(); // loadData ya existe en el componente
    } catch {
        toast.error('No se pudo recargar');
    } finally {
        setPrestacionesLoading(null);
    }
}
```

### 3.4 — Trigger al expandir

Buscar la línea donde se llama `setExpandedRow` (~línea 2379):

```typescript
// ANTES:
onClick={() => setExpandedRow(isExpanded ? null : row.personal_id)}

// DESPUÉS:
onClick={() => {
    const next = isExpanded ? null : row.personal_id;
    setExpandedRow(next);
    if (next && liq && (liq.modelo_pago || row.modelo_pago) === 'prestacion_usd') {
        loadPrestacionesForRow(row.personal_id, selectedMes);
    }
}}
```

### 3.5 — Reemplazar el expanded row (~línea 2548)

Buscar:
```tsx
{liq && isExpanded && (
    <tr className="bg-slate-950/60">
        <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {/* ... 4 stat cards ... */}
            </div>
        </td>
    </tr>
)}
```

Reemplazar con:
```tsx
{liq && isExpanded && (
    <tr className="bg-slate-950/60">
        <td colSpan={6} className="px-4 py-4">
            {(liq.modelo_pago || row.modelo_pago) === 'prestacion_usd' ? (
                /* Panel de prestaciones para odontólogos */
                prestacionesLoading === row.personal_id ? (
                    <p className="text-xs text-slate-500 animate-pulse py-2">Cargando prestaciones...</p>
                ) : (
                    <PrestacionesDetallePanel
                        liquidacionId={liq.id}
                        personalId={row.personal_id}
                        mes={selectedMes}
                        prestaciones={prestacionesData[row.personal_id] || []}
                        liquidacionEstado={liq.estado}
                        tc={Number(liq.tc_liquidacion || 1050)}
                        onRefresh={() => refreshPrestacionesForRow(row.personal_id, selectedMes)}
                    />
                )
            ) : (
                /* Vista de horas para personal de staff (sin cambios) */
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">TC</p>
                        <p className="text-sm text-white font-semibold">{Number(liq.tc_liquidacion || 0).toLocaleString('es-AR')}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Precio</p>
                        <p className="text-sm text-white font-semibold">
                            {manualOverride?.moneda === 'USD' ? 'USD' : 'ARS'} {Number(manualOverride?.precio_unitario || liq.valor_hora_snapshot || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Cantidad</p>
                        <p className="text-sm text-white font-semibold">{Number(manualOverride?.cantidad || liq.total_horas || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Observaciones</p>
                        <p className="text-sm text-slate-200 truncate">{liq.observaciones || 'Sin notas'}</p>
                    </div>
                </div>
            )}
        </td>
    </tr>
)}
```

### Steps

- [ ] **Step 3.1:** Agregar imports de `PrestacionesDetallePanel` y `getPrestacionesDelMes` al inicio de `LiquidacionesClient.tsx`
- [ ] **Step 3.2:** Agregar estado `prestacionesData` y `prestacionesLoading` (~línea 1399)
- [ ] **Step 3.3:** Agregar funciones `loadPrestacionesForRow` y `refreshPrestacionesForRow` después de `openDetalleHoras`
- [ ] **Step 3.4:** Actualizar el `onClick` del chevron para cargar prestaciones al expandir
- [ ] **Step 3.5:** Reemplazar el bloque del expanded row para mostrar panel o stat-cards según modelo_pago
- [ ] **Step 3.6:** Build check: `npm run build 2>&1 | grep -E "error TS|Type error|✓"`
- [ ] **Step 3.7:** Commit: `git add app/admin/liquidaciones/LiquidacionesClient.tsx && git commit -m "feat(liquidaciones): integrar PrestacionesDetallePanel en expanded row"`
- [ ] **Step 3.8:** Push: `git push`

---

## Verificación

1. Ir a `/admin/liquidaciones` como owner
2. Expandir una liquidación de un odontólogo (modelo `prestacion_usd`) → debe aparecer la tabla de prestaciones
3. Expandir una liquidación de staff (modelo `hora_ars`) → debe mostrar los 4 stat-cards de siempre
4. Editar una prestación → cambiar monto → guardar → los totales de la liquidación se actualizan
5. Agregar una nueva prestación → aparece en la tabla, totales se recalculan
6. Eliminar una prestación → desaparece, totales se recalculan
7. El `estado` de la liquidación NO cambia tras editar (sigue `approved` o `paid` si lo era)
8. `npm run build` sin errores

---

## Notas para el implementador

- `selectedMes` ya existe en el componente como estado. Es el mes actualmente seleccionado en el selector de mes.
- `loadData` ya existe como función para recargar la lista de liquidaciones. Usarla en `refreshPrestacionesForRow`.
- El componente `LiquidacionesClient.tsx` tiene ~2600 líneas — hacer ediciones quirúrgicas, no refactors.
- Si TypeScript se queja de que `PrestacionRealizada` no es exportable desde el action, exportarlo explícitamente con `export interface`.
- Los dates en `prestaciones_realizadas.fecha_realizacion` son strings `YYYY-MM-DD`. Al hacer `new Date(fecha)` agregar `T00:00:00` para evitar el timezone bug documentado en CLAUDE.md.
