# Prestador Auto-registro Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Formulario público `/registro-prestador` donde un prestador carga sus propios datos y queda pendiente de activación por el admin.

**Architecture:** Página Next.js pública (no auth) con componente multi-step estilo PremiumAdmissionForm. Server action usa adminClient (bypass RLS) para crear el registro con `activo = false`. PersonalTab muestra badge de pendientes y modal de activación.

**Tech Stack:** Next.js App Router, `motion/react`, Supabase admin client, Tailwind CSS 4, Sonner toasts

---

### Task 1: DB Migration — nuevas columnas en `personal`

**Files:**
- Create: `supabase/migrations/20260312_prestador_autoregistro.sql`

**Step 1: Crear el archivo de migración**

```sql
-- Migration: Prestador auto-registro
-- Adds CBU/alias/CUIT columns and fuente_registro to personal table

ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS cbu TEXT,
    ADD COLUMN IF NOT EXISTS cbu_alias TEXT,
    ADD COLUMN IF NOT EXISTS cuit TEXT,
    ADD COLUMN IF NOT EXISTS fuente_registro TEXT DEFAULT 'admin';

-- Allow anonymous INSERT only with activo = false
-- (RLS policy — anon can create their own pending record)
CREATE POLICY IF NOT EXISTS "anon_can_self_register_prestador"
    ON public.personal
    FOR INSERT
    TO anon
    WITH CHECK (activo = false AND fuente_registro = 'autoregistro');
```

**Step 2: Aplicar en Supabase SQL Editor**

Copiar y ejecutar el SQL en el dashboard de Supabase > SQL Editor.
Verificar que las columnas aparecen en Table Editor > personal.

**Step 3: Commit**

```bash
git add supabase/migrations/20260312_prestador_autoregistro.sql
git commit -m "feat(db): add cbu/alias/cuit/fuente_registro to personal + anon self-register policy"
```

---

### Task 2: Server Action — `registerPrestadorPublico`

**Files:**
- Create: `app/actions/prestador-registro.ts`

**Step 1: Crear el server action**

```typescript
'use server';

import { getAdminClient } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface PrestadorAutoRegistroInput {
    // Paso 1
    nombre: string;
    apellido: string;
    documento: string;
    fecha_nacimiento?: string;
    // Paso 2
    email: string;
    whatsapp: string;
    direccion?: string;
    barrio_localidad?: string;
    // Paso 3
    tipo_trabajo: string; // área que eligió (ej: "Odontología", "Laboratorio")
    condicion_afip?: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    // Paso 4
    cbu?: string;
    cbu_alias?: string;
    cuit?: string;
}

export async function registerPrestadorPublico(data: PrestadorAutoRegistroInput) {
    const adminSupabase = getAdminClient();

    // Check for duplicate documento
    const { data: existing } = await adminSupabase
        .from('personal')
        .select('id')
        .eq('documento', data.documento)
        .maybeSingle();

    if (existing) {
        return { error: 'Ya existe un prestador registrado con ese DNI.' };
    }

    const { error } = await adminSupabase.from('personal').insert({
        nombre: data.nombre,
        apellido: data.apellido,
        documento: data.documento,
        email: data.email,
        whatsapp: data.whatsapp,
        direccion: data.direccion || null,
        barrio_localidad: data.barrio_localidad || null,
        area: data.tipo_trabajo,
        tipo: 'prestador',
        condicion_afip: data.condicion_afip || null,
        cbu: data.cbu || null,
        cbu_alias: data.cbu_alias || null,
        cuit: data.cuit || null,
        activo: false,
        fuente_registro: 'autoregistro',
        fecha_ingreso: new Date().toISOString().split('T')[0],
    });

    if (error) {
        console.error('registerPrestadorPublico error:', error);
        return { error: 'Error al registrar. Intentá de nuevo.' };
    }

    revalidatePath('/caja-admin/personal');
    return { success: true };
}
```

**Step 2: Verificar que TypeScript no rompe**

```bash
cd "/Users/am/Downloads/antigravity apps/am-clinica-main"
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sin errores relacionados a este archivo.

**Step 3: Commit**

```bash
git add app/actions/prestador-registro.ts
git commit -m "feat(actions): registerPrestadorPublico server action with admin client"
```

---

### Task 3: Componente `RegistroPrestadorForm`

**Files:**
- Create: `components/prestador/RegistroPrestadorForm.tsx`

**Step 1: Crear el componente multi-step**

El componente sigue exactamente el mismo patrón visual que `PremiumAdmissionForm` (`components/admission/PremiumAdmissionForm.tsx`).
Estudiar ese archivo primero para entender: `fadeInBlur` animation variants, step structure, progress bar, button styles.

```typescript
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ArrowLeft, Check, User, Mail, Phone, MapPin, Building2, CreditCard, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { registerPrestadorPublico, type PrestadorAutoRegistroInput } from '@/app/actions/prestador-registro';

const fadeInBlur = {
    initial: { opacity: 0, y: 20, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -20, filter: 'blur(10px)' },
};

const CONDICIONES_AFIP = [
    { id: 'monotributista', label: 'Monotributista' },
    { id: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { id: 'relacion_dependencia', label: 'Relación de Dependencia' },
    { id: 'otro', label: 'Otro' },
];

const TIPOS_TRABAJO = [
    'Odontología',
    'Laboratorio Dental',
    'Asistente Dental',
    'Limpieza',
    'Recepción / Administración',
    'Kinesiología / Fisioterapia',
    'Otro',
];

type FormData = PrestadorAutoRegistroInput;

type Step = 1 | 2 | 3 | 4;

const STEPS = [
    { label: 'Datos personales', icon: User },
    { label: 'Contacto', icon: Phone },
    { label: 'Perfil', icon: Briefcase },
    { label: 'Datos bancarios', icon: CreditCard },
];

export default function RegistroPrestadorForm() {
    const [step, setStep] = useState<Step>(1);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [formData, setFormData] = useState<Partial<FormData>>({});

    const update = (fields: Partial<FormData>) =>
        setFormData((prev) => ({ ...prev, ...fields }));

    async function handleSubmit() {
        setSubmitting(true);
        const result = await registerPrestadorPublico(formData as FormData);
        setSubmitting(false);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        setDone(true);
    }

    if (done) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
                <motion.div
                    {...fadeInBlur}
                    transition={{ duration: 0.5 }}
                    className="text-center max-w-md"
                >
                    <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">¡Registro enviado!</h1>
                    <p className="text-white/60 text-sm leading-relaxed">
                        Tus datos fueron recibidos. El equipo de administración los revisará
                        y te contactará para confirmar el inicio.
                    </p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
            {/* Progress bar */}
            <div className="w-full max-w-md mb-8">
                <div className="flex justify-between mb-2">
                    {STEPS.map((s, i) => (
                        <div
                            key={i}
                            className={`flex-1 h-1 rounded-full mx-0.5 transition-all duration-500 ${
                                i + 1 <= step ? 'bg-white' : 'bg-white/10'
                            }`}
                        />
                    ))}
                </div>
                <p className="text-white/40 text-xs text-center">
                    Paso {step} de {STEPS.length} — {STEPS[step - 1].label}
                </p>
            </div>

            {/* Card */}
            <div className="w-full max-w-md">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div key="step1" {...fadeInBlur} transition={{ duration: 0.3 }}>
                                <h2 className="text-xl font-bold text-white mb-1">Datos personales</h2>
                                <p className="text-white/50 text-sm mb-6">Empecemos con tu información básica</p>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Nombre *</label>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                                placeholder="Ej: María"
                                                value={formData.nombre || ''}
                                                onChange={(e) => update({ nombre: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Apellido *</label>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                                placeholder="Ej: García"
                                                value={formData.apellido || ''}
                                                onChange={(e) => update({ apellido: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">DNI / Documento *</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                            placeholder="Ej: 35123456"
                                            value={formData.documento || ''}
                                            onChange={(e) => update({ documento: e.target.value.replace(/\D/g, '') })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Fecha de nacimiento</label>
                                        <input
                                            type="date"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                            value={formData.fecha_nacimiento || ''}
                                            onChange={(e) => update({ fecha_nacimiento: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div key="step2" {...fadeInBlur} transition={{ duration: 0.3 }}>
                                <h2 className="text-xl font-bold text-white mb-1">Contacto</h2>
                                <p className="text-white/50 text-sm mb-6">¿Cómo te contactamos?</p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Email *</label>
                                        <input
                                            type="email"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                            placeholder="tu@email.com"
                                            value={formData.email || ''}
                                            onChange={(e) => update({ email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">WhatsApp *</label>
                                        <div className="flex gap-2">
                                            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/60 text-sm shrink-0">
                                                +54
                                            </div>
                                            <input
                                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                                placeholder="11 2345 6789"
                                                value={formData.whatsapp || ''}
                                                onChange={(e) => update({ whatsapp: '+54' + e.target.value.replace(/\D/g, '') })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Dirección</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                            placeholder="Calle, número"
                                            value={formData.direccion || ''}
                                            onChange={(e) => update({ direccion: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Barrio / Localidad</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                            placeholder="Ej: Palermo, CABA"
                                            value={formData.barrio_localidad || ''}
                                            onChange={(e) => update({ barrio_localidad: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div key="step3" {...fadeInBlur} transition={{ duration: 0.3 }}>
                                <h2 className="text-xl font-bold text-white mb-1">Perfil profesional</h2>
                                <p className="text-white/50 text-sm mb-6">¿En qué área trabajás?</p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-2">Tipo de trabajo *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {TIPOS_TRABAJO.map((tipo) => (
                                                <button
                                                    key={tipo}
                                                    type="button"
                                                    onClick={() => update({ tipo_trabajo: tipo })}
                                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all ${
                                                        formData.tipo_trabajo === tipo
                                                            ? 'bg-white text-black'
                                                            : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                                                    }`}
                                                >
                                                    {tipo}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-2">Condición AFIP</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {CONDICIONES_AFIP.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => update({ condicion_afip: c.id as PrestadorAutoRegistroInput['condicion_afip'] })}
                                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all ${
                                                        formData.condicion_afip === c.id
                                                            ? 'bg-white text-black'
                                                            : 'bg-white/5 border border-white/10 text-white/70 hover:border-white/30'
                                                    }`}
                                                >
                                                    {c.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div key="step4" {...fadeInBlur} transition={{ duration: 0.3 }}>
                                <h2 className="text-xl font-bold text-white mb-1">Datos bancarios</h2>
                                <p className="text-white/50 text-sm mb-6">Para procesar tus pagos (podés completarlo después)</p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">CBU</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30 font-mono"
                                            placeholder="22 dígitos"
                                            maxLength={22}
                                            value={formData.cbu || ''}
                                            onChange={(e) => update({ cbu: e.target.value.replace(/\D/g, '') })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Alias CBU</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30"
                                            placeholder="Ej: maria.garcia.bna"
                                            value={formData.cbu_alias || ''}
                                            onChange={(e) => update({ cbu_alias: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">CUIT / CUIL</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/30 font-mono"
                                            placeholder="20-12345678-9"
                                            value={formData.cuit || ''}
                                            onChange={(e) => update({ cuit: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Navigation */}
                    <div className="flex gap-3 mt-8">
                        {step > 1 && (
                            <button
                                type="button"
                                onClick={() => setStep((s) => (s - 1) as Step)}
                                className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/10 text-white/70 rounded-xl text-sm hover:border-white/30 transition-all"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Atrás
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (step < 4) setStep((s) => (s + 1) as Step);
                                else handleSubmit();
                            }}
                            disabled={submitting}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-black rounded-xl text-sm font-semibold hover:bg-white/90 transition-all disabled:opacity-50"
                        >
                            {step === 4 ? (submitting ? 'Enviando...' : 'Enviar registro') : 'Continuar'}
                            {step < 4 && <ArrowRight className="w-4 h-4" />}
                            {step === 4 && !submitting && <Check className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Branding */}
                <p className="text-center text-white/20 text-xs mt-6">AM Clínica — Registro de Prestadores</p>
            </div>
        </div>
    );
}
```

**Step 2: Verificar TypeScript**

```bash
cd "/Users/am/Downloads/antigravity apps/am-clinica-main"
npx tsc --noEmit 2>&1 | grep -i "RegistroPrestador\|prestador-registro" | head -20
```

**Step 3: Commit**

```bash
git add components/prestador/RegistroPrestadorForm.tsx
git commit -m "feat(ui): RegistroPrestadorForm — multi-step premium form for worker self-registration"
```

---

### Task 4: Página pública `/registro-prestador`

**Files:**
- Create: `app/registro-prestador/page.tsx`

**Step 1: Crear la página**

```typescript
import { Suspense } from 'react';
import RegistroPrestadorForm from '@/components/prestador/RegistroPrestadorForm';

export const metadata = {
    title: 'Registro de Prestador — AM Clínica',
    description: 'Completá tus datos para sumarte al equipo',
    robots: 'noindex',
};

export default function RegistroPrestadorPage() {
    return (
        <main className="min-h-screen bg-[#050505]">
            <Suspense fallback={<div className="min-h-screen" />}>
                <RegistroPrestadorForm />
            </Suspense>
        </main>
    );
}
```

**Step 2: Verificar que la ruta no requiere auth**

Revisar `middleware.ts` para confirmar que `/registro-prestador` está en la lista de rutas públicas (junto a `/admision`, `/actualizar-datos`).

Buscar en `middleware.ts`:
```bash
grep -n "admision\|registro\|publicRoutes\|matcher" middleware.ts | head -20
```

Si `/registro-prestador` no está en la lista pública, agregar:
```typescript
// En el array de rutas públicas:
'/registro-prestador',
```

**Step 3: Commit**

```bash
git add app/registro-prestador/page.tsx middleware.ts
git commit -m "feat(routing): /registro-prestador public page + middleware exemption"
```

---

### Task 5: Botón "Copiar link" + Badge pendientes en PersonalTab

**Files:**
- Modify: `components/caja-admin/PersonalTab.tsx`

**Step 1: Leer el header actual de PersonalTab para entender dónde insertar**

Buscar en el archivo la sección del header del tab (cerca de donde dice "Prestadores" o donde están los botones de filtro).

**Step 2: Agregar estado y lógica para pendientes**

En la sección de states del componente, agregar:

```typescript
// Conteo de prestadores pendientes de activación
const pendingCount = personal.filter(
    (p) => !p.activo && p.fuente_registro === 'autoregistro'
).length;

// Para copiar link
const [linkCopied, setLinkCopied] = useState(false);

function copyRegistroLink() {
    const url = `${window.location.origin}/registro-prestador`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    toast.success('Link copiado');
    setTimeout(() => setLinkCopied(false), 2000);
}
```

Nota: `personal` ya está cargado en el componente (`const [personal, setPersonal] = useState<PersonalRecord[]>([])`).
Nota: `fuente_registro` es una nueva columna — agregar al tipo `PersonalRecord` si es necesario:
```typescript
fuente_registro?: string | null;
```

**Step 3: Agregar botón "Copiar link" al header**

Buscar el botón "Agregar prestador" (`openCreateForm`) en el header. Junto a él, agregar:

```tsx
{/* Botón copiar link de registro */}
<button
    type="button"
    onClick={copyRegistroLink}
    className="flex items-center gap-2 px-3 py-2 text-sm bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:border-white/30 transition-all"
    title="Copiar link para que el prestador complete sus datos"
>
    {linkCopied ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" />}
    {linkCopied ? 'Copiado' : 'Link registro'}
</button>
```

Asegurarse de importar `Link2` de `lucide-react`.

**Step 4: Agregar badge de pendientes en el tab/sección**

Buscar donde se renderiza el título/tab "Prestadores" o "Personal". Agregar el badge:

```tsx
{pendingCount > 0 && (
    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
        {pendingCount}
    </span>
)}
```

**Step 5: Verificar TypeScript**

```bash
cd "/Users/am/Downloads/antigravity apps/am-clinica-main"
npx tsc --noEmit 2>&1 | grep "PersonalTab" | head -10
```

**Step 6: Commit**

```bash
git add components/caja-admin/PersonalTab.tsx
git commit -m "feat(ui): copy registration link + pending badge in PersonalTab"
```

---

### Task 6: Modal de activación de pendientes

**Files:**
- Modify: `components/caja-admin/PersonalTab.tsx`

**Step 1: Agregar estado para modal de activación**

```typescript
const [activatingPrestador, setActivatingPrestador] = useState<PersonalRecord | null>(null);
const [activationData, setActivationData] = useState<{
    area: string;
    modelo_pago: 'horas' | 'prestaciones' | 'mensual';
}>({ area: '', modelo_pago: 'prestaciones' });
```

**Step 2: Server action para activar**

En `app/actions/worker-portal.ts` (o crear un helper ahí), agregar:

```typescript
export async function activatePrestadorPendiente(
    id: string,
    area: string,
    modelo_pago: string
): Promise<{ error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autorizado' };

    const adminSupabase = getAdminClient();
    const { error } = await adminSupabase
        .from('personal')
        .update({ activo: true, area, modelo_pago })
        .eq('id', id);

    if (error) return { error: error.message };
    revalidatePath('/caja-admin/personal');
    return {};
}
```

**Step 3: UI del modal de activación**

El modal filtra los prestadores pendientes. Cuando admin hace click en uno:

```tsx
{/* Modal activación — solo se muestra cuando hay un pendiente seleccionado */}
{activatingPrestador && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={() => setActivatingPrestador(null)} />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 w-full max-w-sm m-4">
            <h3 className="font-bold text-lg mb-1">Activar prestador</h3>
            <p className="text-sm text-slate-500 mb-4">
                {activatingPrestador.nombre} {activatingPrestador.apellido}
            </p>

            <div className="space-y-4">
                <div>
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Área</label>
                    <select
                        value={activationData.area}
                        onChange={(e) => setActivationData(d => ({ ...d, area: e.target.value }))}
                        className="w-full border rounded-xl px-3 py-2 text-sm"
                    >
                        <option value="">Seleccionar área...</option>
                        {personalAreas.map((a) => (
                            <option key={a.id} value={a.nombre}>{a.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Modelo de pago</label>
                    <div className="flex gap-2">
                        {(['horas', 'prestaciones', 'mensual'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setActivationData(d => ({ ...d, modelo_pago: m }))}
                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium capitalize transition-all ${
                                    activationData.modelo_pago === m
                                        ? 'bg-black text-white dark:bg-white dark:text-black'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex gap-3 mt-6">
                <button
                    type="button"
                    onClick={() => setActivatingPrestador(null)}
                    className="flex-1 px-4 py-2.5 text-sm border rounded-xl"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    disabled={!activationData.area}
                    onClick={async () => {
                        const result = await activatePrestadorPendiente(
                            activatingPrestador.id,
                            activationData.area,
                            activationData.modelo_pago
                        );
                        if (result.error) {
                            toast.error(result.error);
                        } else {
                            toast.success('Prestador activado');
                            setActivatingPrestador(null);
                            // Refetch personal list
                            fetchPersonal();
                        }
                    }}
                    className="flex-1 px-4 py-2.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-xl font-semibold disabled:opacity-40"
                >
                    Activar
                </button>
            </div>
        </div>
    </div>
)}
```

**Step 4: Sección "Pendientes" en la lista**

Si `pendingCount > 0`, mostrar una sección separada en la lista de prestadores:

```tsx
{pendingCount > 0 && (
    <div className="mb-6">
        <h3 className="text-sm font-semibold text-amber-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pendientes de activar ({pendingCount})
        </h3>
        <div className="space-y-2">
            {personal
                .filter((p) => !p.activo && p.fuente_registro === 'autoregistro')
                .map((p) => (
                    <div
                        key={p.id}
                        className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-xl"
                    >
                        <div>
                            <p className="font-medium text-sm">{p.nombre} {p.apellido}</p>
                            <p className="text-xs text-slate-500">{p.email} · {p.documento}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setActivatingPrestador(p);
                                setActivationData({ area: p.area || '', modelo_pago: 'prestaciones' });
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all"
                        >
                            Activar
                        </button>
                    </div>
                ))}
        </div>
    </div>
)}
```

**Step 5: Verificar TypeScript**

```bash
cd "/Users/am/Downloads/antigravity apps/am-clinica-main"
npx tsc --noEmit 2>&1 | grep -E "PersonalTab|activat" | head -20
```

**Step 6: Commit**

```bash
git add components/caja-admin/PersonalTab.tsx app/actions/worker-portal.ts
git commit -m "feat(ui): pending prestadores section + activation modal in PersonalTab"
```

---

### Task 7: Verificación end-to-end

**Step 1: Build completo**

```bash
cd "/Users/am/Downloads/antigravity apps/am-clinica-main"
npm run build 2>&1 | tail -20
```

Esperado: `✓ Compiled successfully` sin errores de tipo.

**Step 2: Verificar ruta pública**

Abrir en browser: `http://localhost:3000/registro-prestador`
Esperado: formulario multi-step en fondo negro, sin requerir login.

**Step 3: Test flujo completo**

1. Abrir `/registro-prestador`
2. Completar los 4 pasos con datos de prueba
3. Enviar
4. Verificar en Supabase Table Editor > `personal` que el registro existe con `activo = false` y `fuente_registro = 'autoregistro'`
5. Ir a `/caja-admin/personal`
6. Verificar badge naranja con el número
7. Hacer click en "Activar", elegir área + modelo, confirmar
8. Verificar que el prestador aparece en la lista activa

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat(prestador-registro): complete self-registration flow with admin activation"
```
