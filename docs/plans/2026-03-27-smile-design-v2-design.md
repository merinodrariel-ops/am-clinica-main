# Smile Design v2 — Design Spec

> **Para agentes:** Implementar con `superpowers:writing-plans` → `superpowers:executing-plans`.

**Goal:** Integrar Smile Design con IA directamente dentro del PhotoStudioModal y en la grilla de fotos del paciente, con resultado interactivo (slider antes/después) compartible con el paciente vía portal.

**Arquitectura:** El `SmileDesign.tsx` existente se refactoriza en un hook composable (`useSmileDesign`). El `PhotoStudioModal` agrega un modo "Smile Design" en su panel de herramientas. El resultado se guarda en Drive como JPEG y genera un link al portal del paciente con slider interactivo full-screen.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Gemini 2.0 Flash (align + enhance vía `/api/smile-design/*`), Supabase (storage + DB), Google Drive (archivos paciente), portal paciente (`/mi-clinica/[token]`).

---

## Decisiones de diseño

| Decisión | Elegido | Descartado |
|---|---|---|
| Entry point | Toolbar del editor + botón rápido en grilla | Tab separada en ficha |
| Alineado | Auto-silencioso vía API + grilla toggle | Manual / confirmación previa |
| Output | Slider interactivo (portal) + JPEG en Drive | Solo descarga / reemplazar original |
| Video | Fase 2 (documentada abajo, NO implementar) | No en este release |
| Controles | Defaults automáticos; tweaks post-resultado | Configuración previa al proceso |
| Token paciente | Reutilizar `patient_portal_tokens.token` existente | Tokens separados por resultado |
| Ruta slider | Nueva página `/mi-clinica/[token]/smile/[smileId]` | Modal/tab dentro de página existente |

---

## Flujo completo

```
Usuario abre foto en PhotoStudioModal → click ✨ "Smile Design" en toolbar
        ↓
1. API /align: detecta pupilas, devuelve { rotation, pupils, smileLine, midline }
   → silencioso (~1s). Guarda coordenadas en estado.
        ↓
2. API /enhance: genera imagen mejorada con defaults automáticos:
   { level: 'Natural White', edges: true, edgesIntensity: 'Medio',
     texture: true, textureIntensity: 'Medio', shape: 0 }
   → spinner "Generando smile design..." (~3-5s)
        ↓
3. PhotoStudio entra en modo smileDesign:
   - Canvas izquierdo: slider antes/después (handle en el centro, 50%)
   - Grilla de referencia overlay: OFF por default, toggle debajo del canvas
   - Panel derecho reemplazado por SmileDesignControls
        ↓
4. Usuario puede ajustar controles → "Regenerar" → nueva llamada a /enhance
   (mantiene misma imagen alineada, cambia solo los parámetros)
        ↓
5. "Guardar en Drive" → genera JPEG compuesto (canvas compositor 50/50)
   → sube a folder Drive del paciente → guarda en smile_design_results
        ↓
6. "Link para paciente" → obtiene/crea token en patient_portal_tokens
   → genera URL /mi-clinica/[token]/smile/[smileId]
   → copia al clipboard + botón abrir WhatsApp con mensaje pre-escrito
```

---

## Grilla de referencia

Tres líneas SVG superpuestas sobre el canvas, visibles solo cuando toggle = ON. Se calculan una sola vez a partir de la respuesta de `/api/smile-design/align`:

| Línea | Color | Cómo se calcula |
|---|---|---|
| Bipupilar | Amarillo `#fbbf24` dashed | Y = promedio de `pupils.left.y` y `pupils.right.y` |
| Sonrisa | Verde `#34d399` dashed | Y = `smileLine.y` del response de /align |
| Línea media | Azul `#60a5fa` dashed | X = `midline.x` del response de /align |

Toggle vive debajo del canvas. OFF por default. El overlay es solo visual — no afecta el procesamiento.
La grilla está disponible desde que termina `/align` (antes de que termine `/enhance`).

---

## Panel de controles SmileDesignControls

### Nivel de blanco (3 botones exclusivos)
```
[ Natural ] [ ● Natural White (default) ] [ Natural Ultra White ]
```

### Bordes incisales (toggle + intensidad)
Toggle ON/OFF (default: ON) + selector: `Sutil` / `● Medio` / `Marcado`
Genera el efecto de translucidez azulada en el borde incisal.

### Textura dental (toggle + intensidad)
Toggle ON/OFF (default: ON) + selector: `Sutil` / `● Medio` / `Detallado`
Microestructura superficial del esmalte.

### Forma dental (slider continuo)
`Femenino ←───●─── Masculino`  (default: centro = 0)
Femenino = bordes redondeados · Masculino = bordes cuadrados

### Botones de acción
- `🔄 Regenerar` (púrpura) — llama /enhance con nuevos parámetros
- `💾 Guardar en Drive` (verde) — genera JPEG compuesto + guarda
- `🔗 Link para paciente` (outline) — habilita solo después de guardar
- `✕ Salir de Smile Design` — vuelve al modo edición normal

### Estado / feedback
```
✓ Procesado en 4.2s · Auto-alineado · Natural White
```
Error handling: si /align o /enhance falla → toast "No se pudo procesar la foto. Intentá de nuevo." + botón retry.

---

## Implementación del slider antes/después (portal)

**Técnica:** `<input type="range">` superpuesto sobre dos imágenes absolutas. Simple, touch-friendly nativo.
- La imagen "antes" tiene `clip-path: inset(0 X% 0 0)` donde X va de 0 a 100
- La imagen "después" está debajo (visible en el área descubierta)
- Handle visual centrado en la posición del range
- Full-screen: `width: 100vw; height: 100vh; object-fit: cover`
- Si before/after tienen distintas dimensiones → `object-fit: cover` centra ambas

**Generación del JPEG compuesto (para Drive):**
Canvas client-side: renderizar before a la izquierda (50%) y after a la derecha (50%) en un `<canvas>` offscreen, exportar como JPEG vía `toBlob()`. Mismo patrón que `exportToBlob()` en PhotoStudioModal.

---

## Nueva tabla: `smile_design_results`

```sql
CREATE TABLE smile_design_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id INT REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
  before_drive_url TEXT NOT NULL,      -- URL del archivo original en Drive
  after_drive_url TEXT NOT NULL,       -- URL de la imagen mejorada (subida a Drive)
  composite_drive_url TEXT,            -- JPEG 50/50 guardado en Drive (nullable hasta guardar)
  settings JSONB NOT NULL DEFAULT '{}',
  -- settings shape:
  -- { "level": "Natural White", "edges": true, "edgesIntensity": "Medio",
  --   "texture": true, "textureIntensity": "Medio", "shape": 0 }
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false
);

-- RLS
ALTER TABLE smile_design_results ENABLE ROW LEVEL SECURITY;

-- Staff (creator) puede ver/editar sus resultados
CREATE POLICY "staff_own_results" ON smile_design_results
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Admin/owner ven todo
CREATE POLICY "admin_all_results" ON smile_design_results
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('owner', 'admin'));

-- Lectura pública por patient_id (para el portal — verificación por token en API)
-- El portal NO usa auth de Supabase; el acceso es controlado por la server action
-- que verifica patient_portal_tokens antes de retornar datos
```

---

## Token: reutilizar patient_portal_tokens

- Al generar el link para paciente, se busca token existente en `patient_portal_tokens` para ese `patient_id`
- Si no existe → se genera uno nuevo (upsert, 365 días para smile design — no caduca como los de actualización de datos)
- URL: `/mi-clinica/[token]/smile/[smileId]`
- La página del portal verifica: ¿el token corresponde al `patient_id` del `smile_design_results.patient_id`?

---

## Nueva ruta en portal: `/mi-clinica/[token]/smile/[id]`

Archivo nuevo: `app/mi-clinica/[token]/smile/[id]/page.tsx`
- Server component que lee el smile_design_result via admin client (bypass RLS)
- Verifica que el token sea válido para ese patient_id
- Renderiza slider full-screen con el componente `BeforeAfterSlider`
- Sin nav, sin header — solo la foto + el handle + branding mínimo

---

## Patrones de cliente Supabase

- `PhotoStudioModal.tsx` es `'use client'` → usar `createClient` de `@/utils/supabase/client`
- `app/actions/smile-design.ts` es server action → usar `await createClient()` de `@/utils/supabase/server` para auth check + `createAdminClient()` para writes a smile_design_results y lectura de tokens
- La página del portal usa server component → `createAdminClient()` directamente

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `hooks/useSmileDesign.ts` | CREAR — hook que expone `{ process, regenerate, state, result, gridData }` |
| `components/patients/drive/PhotoStudioModal.tsx` | MODIFICAR — agregar modo `smileDesign`, importar hook |
| `components/patients/drive/SmileDesignControls.tsx` | CREAR — panel de controles (nivel, bordes, textura, forma) |
| `components/patients/drive/BeforeAfterSlider.tsx` | CREAR — slider interactivo reutilizable |
| `components/patients/drive/DriveFileCard.tsx` | MODIFICAR — agregar botón ✨ quick-access |
| `app/actions/smile-design.ts` | CREAR — `saveSmileDesignResult`, `getSmileDesignResult`, `generateSmileShareLink` |
| `app/mi-clinica/[token]/smile/[id]/page.tsx` | CREAR — página portal con slider full-screen |
| `supabase/migrations/20260327_smile_design_results.sql` | CREAR — tabla + RLS |
| `components/smile-studio/SmileDesign.tsx` | MODIFICAR — extraer lógica en hook (puede hacerse en paralelo, no bloqueante) |

---

## `useSmileDesign` — contrato del hook

```typescript
type SmileSettings = {
  level: 'Natural' | 'Natural White' | 'Natural Ultra White';
  edges: boolean;
  edgesIntensity: 'Sutil' | 'Medio' | 'Marcado';
  texture: boolean;
  textureIntensity: 'Sutil' | 'Medio' | 'Detallado';
  shape: number; // -1 (femenino) a 1 (masculino), default 0
};

type SmileGridData = {
  pupils: { left: {x:number,y:number}, right: {x:number,y:number} };
  bipupilarY: number;   // normalizado 0-1
  smileLineY: number;   // normalizado 0-1
  midlineX: number;     // normalizado 0-1
};

type UseSmileDesignReturn = {
  process: (imageBlob: Blob) => Promise<void>;
  regenerate: (settings: SmileSettings) => Promise<void>;
  state: 'idle' | 'aligning' | 'enhancing' | 'ready' | 'error';
  result: { beforeUrl: string; afterUrl: string } | null;
  gridData: SmileGridData | null;
  settings: SmileSettings;
  setSettings: (s: Partial<SmileSettings>) => void;
  error: string | null;
};
```

---

## Folder Drive para guardar resultados

Usar la carpeta existente del paciente (misma que PhotoStudio usa para guardar ediciones).
Naming del archivo: `smile-design-[timestamp]-after.jpg` y `smile-design-[timestamp]-composite.jpg`.
No se crea subcarpeta nueva — se guarda junto a las otras fotos editadas.

---

## Criterios de éxito (DoD)

1. Click ✨ en toolbar → resultado visible en ≤ 8 segundos (align + enhance)
2. Grilla de referencia toggle funciona (muestra/oculta las 3 líneas)
3. Cambiar nivel de blanco → Regenerar → nuevo resultado en ≤ 6 segundos
4. "Guardar en Drive" → JPEG aparece en carpeta del paciente en Drive
5. "Link para paciente" → URL copiada al clipboard + copia WhatsApp
6. Portal `/mi-clinica/[token]/smile/[id]` → slider interactivo, funciona en móvil con touch
7. `npm run build` sin errores TypeScript

---

## Fase 2 — Video (NO implementar en este ciclo)

Documentado para futura referencia:
- Botón "Generar video" en SmileDesignControls, disponible solo cuando hay resultado guardado
- API de generación de video (Veo3 u otro proveedor) recibe before + after
- MP4 de 3-5 segundos con animación de reveal
- Latencia alta (~30-60s) → requiere job asíncrono, no request síncrono
- Se guarda en Drive y en `smile_design_results.video_drive_url` (columna a agregar en Fase 2)
