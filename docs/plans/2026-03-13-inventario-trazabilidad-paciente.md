# Trazabilidad de Materiales por Paciente — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que al registrar una salida de inventario se asocie opcionalmente a un paciente, y que en la ficha del paciente se vean todos los materiales utilizados.

**Architecture:** Se agrega `paciente_id` + `paciente_nombre` (nullable) a `inventario_movimientos`. El formulario de salida incluye un autocomplete de pacientes (solo aparece en SALIDA). La ficha del paciente muestra un tab "Materiales" con el historial de movimientos vinculados.

**Tech Stack:** Next.js 16 Server Actions, Supabase (browser client para autocomplete, server client para acciones), TypeScript, Tailwind CSS.

---

## Contexto crítico para el implementador

- **Cliente Supabase:** browser → `createClient()` de `@/utils/supabase/client`. Server actions → `createClient()` de `@/utils/supabase/server`. NUNCA `lib/supabase.ts`.
- **`profiles.categoria`** — la columna de rol se llama `categoria`, NO `role`.
- **`useAuth()`** devuelve `{ categoria }`, no `role`.
- **Tabla inventario:** `inventario_items` (productos), `inventario_movimientos` (movimientos).
- **Server action de salida:** `registerInventoryEgress` en `app/actions/inventory-stock.ts`.
- **Formulario de movimiento:** `components/inventario/MovimientoStockForm.tsx` — modal que recibe `tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE'`.
- **Ficha del paciente:** `components/patients/PatientDashboard.tsx` — tabs: `datos`, `historia`, `finanzas`, `recalls`, `archivos`, `smile_design`, `diseno`, `portal`.
- **Autocomplete de pacientes:** patrón ya existente en `components/caja/NuevoIngresoForm.tsx`. Usa `createClient()` del browser, busca en `pacientes` con `ilike` sobre nombre/apellido/documento.
- **`StockMovementRecord`** usa: `tipo_movimiento`, `cantidad`, `motivo`, `usuario`, `item` — definida en `app/actions/inventory-stock.ts`.

---

### Task 1: Migración DB — agregar paciente_id a inventario_movimientos

**Files:**
- Create: `supabase/migrations/20260313_inventario_paciente_trazabilidad.sql`

**Step 1: Crear el archivo de migración**

```sql
-- Migration: Trazabilidad paciente en movimientos de inventario
-- 2026-03-13

ALTER TABLE public.inventario_movimientos
    ADD COLUMN IF NOT EXISTS paciente_id UUID REFERENCES public.pacientes(id_paciente) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS paciente_nombre TEXT;

-- Index para buscar todos los materiales de un paciente eficientemente
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_paciente
    ON public.inventario_movimientos (paciente_id)
    WHERE paciente_id IS NOT NULL;

COMMENT ON COLUMN public.inventario_movimientos.paciente_id IS 'Paciente al que se destinó este material (solo SALIDA, opcional)';
COMMENT ON COLUMN public.inventario_movimientos.paciente_nombre IS 'Nombre denormalizado del paciente para display rápido';
```

**Step 2: Aplicar la migración via Supabase MCP**

Usar el tool `mcp__supabase-mcp-server__apply_migration` con:
- `project_id`: `ybozzesadqcorvfqpsyo`
- `name`: `inventario_paciente_trazabilidad`
- `query`: el SQL de arriba

**Step 3: Verificar que las columnas existen**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'inventario_movimientos'
AND column_name IN ('paciente_id', 'paciente_nombre');
```

Expected: 2 filas.

**Step 4: Commit**

```bash
git add supabase/migrations/20260313_inventario_paciente_trazabilidad.sql
git commit -m "feat(inventario): add paciente_id + paciente_nombre to inventario_movimientos"
```

---

### Task 2: Actualizar server action registerInventoryEgress + interface

**Files:**
- Modify: `app/actions/inventory-stock.ts`

**Step 1: Leer el archivo actual**

Leer `app/actions/inventory-stock.ts` completo para entender la estructura actual antes de modificar.

**Step 2: Actualizar `StockMovementRecord`**

Agregar dos campos opcionales a la interface (buscar `export interface StockMovementRecord`):

```typescript
export interface StockMovementRecord {
    id: string;
    item_id: string;
    tipo_movimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo: string | null;
    usuario: string;
    created_at: string;
    paciente_id?: string | null;       // ADD
    paciente_nombre?: string | null;   // ADD
    item: {
        id: string;
        nombre: string;
        unidad_medida: string;
        categoria: string;
    } | null;
}
```

**Step 3: Actualizar el tipo de input de `registerInventoryEgress`**

Buscar la función `registerInventoryEgress` y su tipo de input. Agregar los campos opcionales:

```typescript
// Al tipo/interface de input de registerInventoryEgress, agregar:
pacienteId?: string;
pacienteNombre?: string;
```

**Step 4: Pasar los campos al INSERT dentro de `registerInventoryEgress`**

Dentro del INSERT a `inventario_movimientos`, agregar:

```typescript
paciente_id: input.pacienteId || null,
paciente_nombre: input.pacienteNombre || null,
```

**Step 5: Agregar función `getPatientInventoryMaterials`**

Al final del archivo, agregar esta nueva función:

```typescript
export interface PatientMaterialRecord {
    id: string;
    created_at: string;
    tipo_movimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo: string | null;
    usuario: string;
    item: {
        id: string;
        nombre: string;
        unidad_medida: string;
        categoria: string;
        color: string | null;
        descripcion: string | null;
    } | null;
}

export async function getPatientInventoryMaterials(
    pacienteId: string
): Promise<{ data: PatientMaterialRecord[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'No autenticado' };

    const { data, error } = await supabase
        .from('inventario_movimientos')
        .select(`
            id,
            created_at,
            tipo_movimiento,
            cantidad,
            motivo,
            usuario,
            item:inventario_items(id, nombre, unidad_medida, categoria, color, descripcion)
        `)
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: (data || []) as unknown as PatientMaterialRecord[] };
}
```

> **Nota:** El campo `color` en `inventario_items` puede estar mapeado como `area` en el DB — verificar al leer el schema del archivo actual. Si el SELECT falla, ajustar los field names según la definición real de `ProductRecord`.

**Step 6: Verificar TypeScript**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "inventory-stock" | head -20
```

Expected: sin errores.

**Step 7: Commit**

```bash
git add app/actions/inventory-stock.ts
git commit -m "feat(inventario): add paciente fields to egress action + getPatientInventoryMaterials"
```

---

### Task 3: Agregar autocomplete de paciente en MovimientoStockForm

**Files:**
- Modify: `components/inventario/MovimientoStockForm.tsx`

**Step 1: Leer el archivo actual**

Leer `components/inventario/MovimientoStockForm.tsx` completo para entender estructura y props.

**Step 2: Agregar imports necesarios**

Al bloque de imports existente, agregar:
```typescript
import { createClient } from '@/utils/supabase/client';
```

**Step 3: Agregar estados para el autocomplete de paciente**

Dentro del componente (cerca de los otros estados), agregar:
```typescript
const [pacienteQuery, setPacienteQuery] = useState('');
const [pacienteOptions, setPacienteOptions] = useState<Array<{ id_paciente: string; nombre: string; apellido: string }>>([]);
const [pacienteLoading, setPacienteLoading] = useState(false);
const [selectedPaciente, setSelectedPaciente] = useState<{ id_paciente: string; nombre: string; apellido: string } | null>(null);
const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
```

**Step 4: Agregar función de búsqueda de pacientes**

Dentro del componente, antes del return:
```typescript
async function searchPacientes(q: string) {
    if (q.length < 2) { setPacienteOptions([]); return; }
    setPacienteLoading(true);
    const supabase = createClient();
    const { data } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido')
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,documento.ilike.%${q}%`)
        .eq('is_deleted', false)
        .limit(8);
    setPacienteOptions(data || []);
    setPacienteLoading(false);
    setShowPacienteDropdown(true);
}
```

**Step 5: Agregar useEffect para debounce de búsqueda**

```typescript
useEffect(() => {
    if (selectedPaciente) return; // ya seleccionó uno
    const timer = setTimeout(() => searchPacientes(pacienteQuery), 300);
    return () => clearTimeout(timer);
}, [pacienteQuery]);
```

**Step 6: Agregar campo de paciente en el JSX**

El campo solo se muestra cuando `tipo === 'SALIDA'`. Buscá en el JSX dónde está el campo `motivo` (textarea de razón/nota) y agregar ANTES de él:

```tsx
{/* Campo paciente — solo en SALIDA */}
{tipo === 'SALIDA' && (
    <div className="space-y-1.5 relative">
        <label className="text-xs text-white/50 uppercase tracking-wider">
            Paciente <span className="text-white/30 normal-case">(opcional)</span>
        </label>
        {selectedPaciente ? (
            <div className="flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl">
                <span className="text-white text-sm">
                    {selectedPaciente.nombre} {selectedPaciente.apellido}
                </span>
                <button
                    type="button"
                    onClick={() => { setSelectedPaciente(null); setPacienteQuery(''); }}
                    className="text-white/30 hover:text-white/70 transition-colors text-xs"
                >
                    ✕
                </button>
            </div>
        ) : (
            <div className="relative">
                <input
                    type="text"
                    value={pacienteQuery}
                    onChange={e => { setPacienteQuery(e.target.value); setShowPacienteDropdown(true); }}
                    placeholder="Buscar paciente..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                />
                {pacienteLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">…</span>
                )}
                {showPacienteDropdown && pacienteOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                        {pacienteOptions.map(p => (
                            <button
                                key={p.id_paciente}
                                type="button"
                                onClick={() => {
                                    setSelectedPaciente(p);
                                    setPacienteQuery('');
                                    setShowPacienteDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                            >
                                {p.nombre} {p.apellido}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )}
    </div>
)}
```

**Step 7: Pasar paciente al submit**

En la función de submit del formulario, al llamar a `registerInventoryEgress`, agregar:
```typescript
pacienteId: selectedPaciente?.id_paciente,
pacienteNombre: selectedPaciente ? `${selectedPaciente.nombre} ${selectedPaciente.apellido}` : undefined,
```

**Step 8: Limpiar estado al cerrar el modal**

Asegurarse de que cuando el modal se cierra/resetea, también se resetean los estados del paciente:
```typescript
setSelectedPaciente(null);
setPacienteQuery('');
setPacienteOptions([]);
```

**Step 9: Verificar TypeScript**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "MovimientoStockForm\|inventory" | head -20
```

Expected: sin errores.

**Step 10: Commit**

```bash
git add components/inventario/MovimientoStockForm.tsx
git commit -m "feat(inventario): patient autocomplete in SALIDA form for clinical traceability"
```

---

### Task 4: Tab "Materiales" en ficha del paciente

**Files:**
- Modify: `components/patients/PatientDashboard.tsx`

**Step 1: Leer el archivo actual**

Leer `components/patients/PatientDashboard.tsx` completo para entender la estructura de tabs y cómo se cargan los datos.

**Step 2: Agregar import**

```typescript
import { getPatientInventoryMaterials, type PatientMaterialRecord } from '@/app/actions/inventory-stock';
```

**Step 3: Agregar estado**

Cerca de los otros estados del dashboard:
```typescript
const [materiales, setMateriales] = useState<PatientMaterialRecord[]>([]);
const [loadingMateriales, setLoadingMateriales] = useState(false);
```

**Step 4: Cargar materiales al activar el tab**

En el handler de cambio de tab (o en un useEffect que observe el tab activo), agregar:
```typescript
if (tab === 'materiales' && materiales.length === 0) {
    setLoadingMateriales(true);
    getPatientInventoryMaterials(patient.id_paciente).then(res => {
        setMateriales(res.data);
        setLoadingMateriales(false);
    });
}
```

**Step 5: Agregar tab "Materiales" a la lista de tabs**

Buscar donde se definen las tabs (array de objetos con `id`, `label`). Agregar:
```typescript
{ id: 'materiales', label: 'Materiales' }
```

**Step 6: Agregar panel del tab en el JSX**

Buscar donde se renderizan los contenidos de los tabs (switch/if-else por `activeTab`). Agregar:

```tsx
{activeTab === 'materiales' && (
    <div className="space-y-4">
        <h3 className="text-white/60 text-xs uppercase tracking-wider font-medium">
            Materiales utilizados
        </h3>

        {loadingMateriales && (
            <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
        )}

        {!loadingMateriales && materiales.length === 0 && (
            <div className="text-center py-12">
                <p className="text-white/30 text-sm">No hay materiales registrados para este paciente</p>
            </div>
        )}

        {!loadingMateriales && materiales.length > 0 && (
            <div className="space-y-2">
                {materiales.map(m => (
                    <div
                        key={m.id}
                        className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-start gap-4"
                    >
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                                {m.item?.nombre || 'Material desconocido'}
                            </p>
                            <p className="text-white/40 text-xs mt-0.5">
                                {m.item?.categoria}
                                {m.item?.color ? ` · ${m.item.color}` : ''}
                                {m.item?.descripcion ? ` · ${m.item.descripcion}` : ''}
                            </p>
                            {m.motivo && (
                                <p className="text-white/30 text-xs mt-1 italic">{m.motivo}</p>
                            )}
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-white text-sm font-medium">
                                {m.cantidad} {m.item?.unidad_medida || ''}
                            </p>
                            <p className="text-white/30 text-xs mt-0.5">
                                {new Date(m.created_at).toLocaleDateString('es-AR', {
                                    day: 'numeric', month: 'short', year: 'numeric'
                                })}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
)}
```

**Step 7: Verificar TypeScript**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "PatientDashboard\|inventory" | head -20
```

Expected: sin errores.

**Step 8: Commit**

```bash
git add components/patients/PatientDashboard.tsx
git commit -m "feat(patients): tab Materiales con historial de materiales usados por paciente"
```

---

## Testing manual (checklist)

- [ ] Ir a `/inventario` → click "Salida" en un bloque de silicato → se muestra campo "Paciente (opcional)"
- [ ] Escribir "Carolina" en el campo → aparece dropdown con resultados de pacientes
- [ ] Seleccionar una paciente → se muestra badge con su nombre, X para limpiar
- [ ] Registrar la salida → éxito
- [ ] Verificar en DB: `SELECT paciente_id, paciente_nombre FROM inventario_movimientos ORDER BY created_at DESC LIMIT 3` → fila tiene paciente
- [ ] Ir a la ficha de Carolina → tab "Materiales" → se muestra el movimiento con nombre del ítem, cantidad, fecha
- [ ] Registrar una ENTRADA → campo de paciente NO aparece
- [ ] Registrar una SALIDA sin seleccionar paciente → funciona igual que antes (campo es opcional)
