# Patient Dashboard — Scroll Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 9-tab system in `PatientDashboard` with a single scrollable page where sections expand/collapse, with Archivos first and lazy-loading for heavy sections.

**Architecture:** Create a reusable `PatientSection` component with IntersectionObserver lazy-mounting. Rewrite `PatientDashboard` to stack sections vertically. Update `PatientList` links to navigate directly to the archivos section.

**Tech Stack:** React 19, Next.js 16 App Router, Framer Motion (AnimatePresence for collapse), IntersectionObserver API, TypeScript 5

---

### Task 1: Create `PatientSection` component

**Files:**
- Create: `components/patients/PatientSection.tsx`

This is a reusable collapsible section with lazy-mount via IntersectionObserver.

**Step 1: Create the file**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';

interface PatientSectionProps {
    id: string;
    title: string;
    icon: LucideIcon;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

export default function PatientSection({ id, title, icon: Icon, defaultOpen = false, children }: PatientSectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [mounted, setMounted] = useState(defaultOpen);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Lazy-mount: render children only when section enters viewport for the first time.
    // Sections with defaultOpen=true skip this and mount immediately.
    useEffect(() => {
        if (defaultOpen) return; // already mounted
        const el = wrapperRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setMounted(true);
                    obs.disconnect();
                }
            },
            { rootMargin: '200px' } // start loading slightly before visible
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [defaultOpen]);

    return (
        <div ref={wrapperRef} id={id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <Icon size={18} className="text-gray-400 dark:text-white/40 shrink-0" />
                    <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
                </div>
                <motion.div
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown size={16} className="text-gray-400 dark:text-white/30" />
                </motion.div>
            </button>

            {/* Body */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="px-6 pb-6 pt-1">
                            {mounted ? children : (
                                <div className="h-32 flex items-center justify-center text-gray-300 dark:text-white/20 text-sm">
                                    Cargando...
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
```

**Step 2: Verify TypeScript**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main" && npx tsc --noEmit 2>&1 | grep -v "\.next/" | grep "PatientSection" | head -10
```

Expected: no output (no errors).

**Step 3: Commit**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
git add components/patients/PatientSection.tsx
git commit -m "feat(patients): PatientSection collapsible component with lazy-mount"
```

---

### Task 2: Rewrite `PatientDashboard` — remove tabs, add scroll sections

**Files:**
- Modify: `components/patients/PatientDashboard.tsx`

This is the main task. The file is 1276 lines. The changes are:

1. Add import for `PatientSection`
2. Remove: `TABS` array, `PAYMENT_TABS` set, `activeTab` state, `visibleTabs`, `requestedTab`, `defaultTabRaw`, `tabIds`, `defaultTab` — all tab-related variables
3. Remove: the `useEffect` that loads materiales when `activeTab === 'materiales'`; replace with a local `onExpand` callback pattern in Historia Clínica
4. Replace: the tab bar UI (the `<div className="flex mt-4 -mb-px">` block with tab buttons)
5. Replace: the `<AnimatePresence>` + `{activeTab === 'x' && ...}` blocks with `<PatientSection>` wrappers
6. Add: scroll-to-section `useEffect` based on `?section=` URL param
7. Fix: `SmileDesign onSaved` — was `setActiveTab('portal')`, change to scroll to `#portal` section

**Step 1: Read lines 100–135 to have the exact tab state code to delete**

Read `components/patients/PatientDashboard.tsx` lines 100–135.

**Step 2: Apply the changes**

Replace the TABS/state block (lines 100–131) with:

```tsx
// Section visibility: hide finanzas for odontologo/recaptacion
const hidePaymentTabs = isOdontologo || isRecaptacion;

// Materiales lazy state (loaded on expand, not on tab switch)
```

Keep these lines (they stay):
```tsx
const [materiales, setMateriales] = useState<PatientMaterialRecord[]>([]);
const [materialesLoading, setMaterialesLoading] = useState(false);
const [materialesLoaded, setMaterialesLoaded] = useState(false);
```

Replace the materiales `useEffect` (lines 137–146) with:

```tsx
function handleLoadMateriales() {
    if (materialesLoaded) return;
    setMaterialesLoading(true);
    getPatientInventoryMaterials(patient.id_paciente).then(({ data }) => {
        setMateriales(data);
        setMaterialesLoaded(true);
        setMaterialesLoading(false);
    });
}
```

Add the scroll-to-section effect after the existing `useEffect` blocks:

```tsx
// Scroll to section from URL param (?section=archivos)
useEffect(() => {
    const section = searchParams.get('section');
    if (!section) return;
    requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 3: Replace the tab bar UI**

Find the tab bar block (around line 360):
```tsx
{/* Tabs */}
<div className="flex mt-4 -mb-px">
    {visibleTabs.map((tab) => {
        ...
    })}
</div>
```

Delete it entirely. The header area now ends after the action buttons.

**Step 4: Replace the AnimatePresence + tab content block**

Find (around line 385–1073):
```tsx
<AnimatePresence mode="wait">
    <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        ...
    >
        {/* Tab 1: Datos Personales */}
        {activeTab === 'datos' && ( ... )}
        ...
    </motion.div>
</AnimatePresence>
```

Replace the entire `AnimatePresence` block with:

```tsx
<div className="space-y-4">

    {/* 1. Archivos — first, expanded by default */}
    <PatientSection id="archivos" title="Archivos" icon={FolderOpen} defaultOpen>
        <PatientDriveTab
            patientId={patient.id_paciente}
            patientName={`${patient.apellido}, ${patient.nombre}`}
            motherFolderUrl={patient.link_historia_clinica}
        />
    </PatientSection>

    {/* 2. Datos Personales — expanded by default */}
    <PatientSection id="datos" title="Datos Personales" icon={User} defaultOpen>
        {/* ---- paste exact content from {activeTab === 'datos' && ( ... )} block ---- */}
        {/* Remove the outer <div className="bg-white dark:bg-gray-900 rounded-xl ..."> wrapper — PatientSection provides it */}
    </PatientSection>

    {/* 3. Historia Clínica + Prestaciones + Materiales */}
    <PatientSection id="historia" title="Historia Clínica" icon={FileText} defaultOpen>
        {/* ---- paste exact content from {activeTab === 'historia' && ( ... )} blocks ---- */}
        {/* Include both the HC block and the prestaciones block */}
        {/* Remove outer <div className="bg-white ..."> wrappers — PatientSection provides it */}

        {/* Materiales sub-section inside HC */}
        <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-4">
            <button
                onClick={handleLoadMateriales}
                className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-white/50 hover:text-violet-500 transition-colors mb-3"
            >
                <Package size={15} />
                Materiales utilizados
            </button>
            {materialesLoading ? (
                <div className="flex justify-center py-6">
                    <Loader2 className="animate-spin text-violet-500" size={20} />
                </div>
            ) : materialesLoaded ? (
                materiales.length === 0 ? (
                    <p className="text-center text-gray-400 py-6 text-sm">No hay materiales registrados.</p>
                ) : (
                    <div className="space-y-3">
                        {/* ---- paste exact materiales map from {activeTab === 'materiales' && ...} ---- */}
                    </div>
                )
            ) : null}
        </div>
    </PatientSection>

    {/* 4. Finanzas — collapsed, hidden for odontologo/recaptacion */}
    {!hidePaymentTabs && (
        <PatientSection id="finanzas" title="Finanzas" icon={TrendingUp}>
            {/* ---- paste exact content from all {activeTab === 'finanzas' && ...} blocks ---- */}
        </PatientSection>
    )}

    {/* 5. Recalls — collapsed */}
    <PatientSection id="recalls" title="Recalls (Seguimiento)" icon={Bell}>
        <PatientCadence patientId={patient.id_paciente} />
    </PatientSection>

    {/* 6. Smile Design — collapsed */}
    <PatientSection id="smile_design" title="Smile Design ✨" icon={Sparkles}>
        <SmileDesign
            patientId={patient.id_paciente}
            patientName={`${patient.nombre} ${patient.apellido}`}
            onSaved={() => document.getElementById('portal')?.scrollIntoView({ behavior: 'smooth' })}
        />
    </PatientSection>

    {/* 7. Diseño Digital — collapsed */}
    <PatientSection id="diseno" title="Diseño Digital" icon={Sparkles}>
        <DesignReviewTab
            patientId={patient.id_paciente}
            motherFolderUrl={patient.link_historia_clinica ?? null}
            initialReview={designReview}
        />
    </PatientSection>

    {/* 8. Portal 360 — collapsed */}
    <PatientSection id="portal" title="Portal 360" icon={Sparkles}>
        <PatientPortalPanel
            patientId={patient.id_paciente}
            patientName={`${patient.nombre} ${patient.apellido}`}
        />
    </PatientSection>

</div>
```

**Step 5: Add `PatientSection` import at top of file**

```tsx
import PatientSection from './PatientSection';
```

**Step 6: Remove now-unused imports**

Remove from lucide-react import: nothing removed (all icons still used).
Remove from logic: `clsx` usage in tab buttons — if `clsx` is still used elsewhere in the file keep it, otherwise remove.

Check with:
```bash
grep -n "clsx\|activeTab\|setActiveTab\|visibleTabs\|defaultTab\|TABS\b\|PAYMENT_TABS" \
  "components/patients/PatientDashboard.tsx" | head -20
```

Fix any remaining references.

**Step 7: TypeScript check**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main" && npx tsc --noEmit 2>&1 | grep -v "\.next/" | grep "PatientDashboard\|PatientSection" | head -20
```

Expected: no output.

**Step 8: Commit**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
git add components/patients/PatientDashboard.tsx
git commit -m "feat(patients): replace tab system with scrollable sections layout"
```

---

### Task 3: Update `PatientList` links to go directly to Archivos

**Files:**
- Modify: `components/patients/PatientList.tsx`

**Step 1: Find the two patient links**

```bash
grep -n "href.*patients.*id_paciente" components/patients/PatientList.tsx
```

Both occurrences (around lines 251 and 398) need `?section=archivos` appended.

**Step 2: Update both links**

Change:
```tsx
href={`/patients/${patient.id_paciente}`}
```

To:
```tsx
href={`/patients/${patient.id_paciente}?section=archivos`}
```

Both instances. Use replace_all if possible, otherwise edit each separately.

**Step 3: TypeScript check**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main" && npx tsc --noEmit 2>&1 | grep -v "\.next/" | grep "PatientList" | head -10
```

Expected: no output.

**Step 4: Commit**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
git add components/patients/PatientList.tsx
git commit -m "feat(patients): navigate directly to archivos section when opening patient"
```

---

### Task 4: Smoke test + push

**Step 1: Verify no TypeScript errors across all changed files**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main" && npx tsc --noEmit 2>&1 | grep -v "\.next/" | grep "error TS" | head -20
```

Expected: no output.

**Step 2: Manual smoke test (dev server must be running)**

1. Open `/patients` — click any patient → should land with Archivos section visible and expanded at top
2. Scroll down — should see: Datos, Historia Clínica, Finanzas, Recalls, Smile Design, Diseño, Portal
3. Click any section header → should collapse/expand smoothly
4. Open Historia Clínica → click "Materiales utilizados" → should load and show materials
5. Navigate to `/patients/[id]?section=finanzas` → should scroll to Finanzas section

**Step 3: Push**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main" && git push origin main
```

---

## Critical notes for the implementer

- **PatientSection removes the outer card wrapper**: content inside `<PatientSection>` should NOT have `<div className="bg-white dark:bg-gray-900 rounded-xl border ...">` wrappers — `PatientSection` already provides the card container.
- **Historia Clínica has TWO `activeTab === 'historia'` blocks** (lines 489 and 554 in original) — both must go inside the Historia `PatientSection`, one after the other.
- **Finanzas has THREE `activeTab === 'finanzas'` blocks** (lines 621, 651, 739) — all three go inside the Finanzas `PatientSection`.
- **`SmileDesign onSaved`** was `setActiveTab('portal')` — change to `() => document.getElementById('portal')?.scrollIntoView({ behavior: 'smooth' })`.
- **`materiales` useEffect** triggers on `activeTab === 'materiales'` — remove this effect and replace with `handleLoadMateriales()` called from a button click or on first expand of the HC section.
- **Do NOT change any content inside sections** — only change the wrapper/routing mechanism.
