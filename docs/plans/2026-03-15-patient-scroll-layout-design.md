# Patient Dashboard — Scroll Layout Design

**Date:** 2026-03-15
**Status:** Approved

## Goal

Replace the tab-based `PatientDashboard` with a single scrollable page where sections expand/collapse. Archivos (fotos) is the first section and opens expanded by default. All heavy sections lazy-load when they enter the viewport.

## Problem

Currently clicking on a patient requires 3+ clicks to reach photos (patients list → patient → click "Archivos" tab). Photos are the most-used section. The tab system adds friction and hides content.

## Design

### Layout

Single vertical stack of collapsible sections. No tabs, no `activeTab` state. The URL param `?section=archivos` (or any section id) triggers smooth scroll to that section on load. The link from `PatientList` defaults to `?section=archivos`.

### Section Order & Defaults

| # | Section | Default | Lazy load |
|---|---------|---------|-----------|
| 1 | Archivos | **Expanded** | Yes — Drive loads on viewport enter |
| 2 | Datos Personales | Expanded | No (server data) |
| 3 | Historia Clínica + Prestaciones | Expanded | No (server data) |
| ↳ | Materiales (sub-section inside HC) | Collapsed | Yes — loads on expand |
| 4 | Finanzas | Collapsed | Yes |
| 5 | Recalls | Collapsed | Yes |
| 6 | Smile Design | Collapsed | Yes |
| 7 | Diseño Digital | Collapsed | Yes |
| 8 | Portal 360 | Collapsed | Yes |

### `PatientSection` Component

New reusable component in `components/patients/PatientSection.tsx`:

```tsx
interface PatientSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
```

Behaviour:
- Header is always visible (sticky within scroll, shows title + icon + chevron)
- Click header → toggle expanded/collapsed (Framer Motion AnimatePresence)
- `IntersectionObserver` on the section wrapper: when it enters viewport for the first time → `setMounted(true)` → children render
- Before mount: placeholder div with approximate `min-height` so scroll position stays stable
- `defaultOpen=true` sections mount immediately (no lazy gate needed)

### Scroll-to-section on load

In `PatientDashboard`:

```tsx
useEffect(() => {
  const section = searchParams.get('section');
  if (section) {
    requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}, []);
```

### Role-based visibility

Same logic as current tabs:
- `hidePaymentTabs` (odontologo / recaptacion) → Finanzas section hidden entirely
- No other permission changes

### Files to modify

| File | Change |
|------|--------|
| `components/patients/PatientDashboard.tsx` | Remove tabs system, replace with scroll sections |
| `components/patients/PatientSection.tsx` | **Create** — reusable collapsible section |
| `components/patients/PatientList.tsx` | Update patient links to `/patients/[id]?section=archivos` |

### What is NOT changing

- All section content (the JSX inside each section) stays the same — just unwrapped from `{activeTab === 'x' && ...}` guards
- Role/permission logic unchanged
- `dynamic()` imports for heavy components (PatientDriveTab, SmileDesign, DesignReviewTab) remain
- Server-side data fetching in `app/patients/[id]/page.tsx` unchanged
