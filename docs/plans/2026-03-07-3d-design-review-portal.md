# Diseño: Portal 3D — Visor STL + Revisión de Diseño de Sonrisa

**Fecha:** 2026-03-07
**Estado:** Aprobado — listo para implementar
**Scope:** Feature completo en dos partes (STL viewer conectado al portal + flujo de revisión y aprobación de diseño Exocad)

---

## Contexto

AM Clínica trabaja con flujos de diseño digital de sonrisa (Exocad). El proceso actual:
1. Se toman escaneos 3D de la boca del paciente (archivos `.stl` / `.ply`) — quedan en Google Drive
2. El diseñador Julián genera un HTML autocontenido desde Exocad (foto referencia + capas 3D interactivas)
3. Julián manda el HTML por WhatsApp al staff → el staff lo sube al Drive del paciente
4. Hoy no hay forma de que la paciente vea ni apruebe el diseño digitalmente

**Objetivo:** Que la paciente vea su escaneo original y el diseño de sonrisa en su portal, y pueda aprobar o pedir cambios desde el celular con un tap. El staff recibe notificaciones en tiempo real.

---

## Arquitectura elegida

**Opción B + Drive-native:** el HTML vive en Google Drive (carpeta `[EXOCAD]/HTML/` del paciente), se sirve via proxy seguro desde nuestra API. Sin Supabase Storage para los HTML. Los STL siguen en Drive y usan el STLViewer Three.js existente.

---

## Piezas del sistema

### 1. Storage — Google Drive
- Cada paciente en flujo de diseño tiene: `[Drive raíz paciente] / [EXOCAD] / HTML / [diseño].html`
- La carpeta `HTML` se crea automáticamente cuando el staff activa "Flujo Diseño Digital"
- Julián sube/reemplaza **un solo archivo** ahí — siempre el más actual, sin versiones
- El staff nunca toca el archivo, solo le da acceso a la paciente

### 2. Proxy API — `/api/design-review/[patientId]/html`
- Valida el token del request
- Lee el HTML desde Drive usando la service account
- Lo sirve como `text/html` al iframe del portal
- Así si Julián actualiza el archivo, la paciente siempre ve la versión más fresca sin regenerar links

### 3. Base de datos

**Nueva tabla: `patient_design_reviews`**
```sql
id                  UUID PK DEFAULT gen_random_uuid()
patient_id          UUID NOT NULL REFERENCES pacientes(id_paciente)
drive_html_file_id  TEXT NULL         -- ID del archivo HTML en Drive
exocad_folder_id    TEXT NULL         -- ID de la carpeta [EXOCAD]/HTML/ en Drive
label               TEXT NOT NULL     -- "Diseño de Sonrisa — Marzo 2026"
status              TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'viewed', 'approved', 'revision'))
patient_comment     TEXT NULL
uploaded_by         UUID REFERENCES profiles(id)
created_at          TIMESTAMPTZ DEFAULT NOW()
viewed_at           TIMESTAMPTZ NULL   -- primera apertura del link
responded_at        TIMESTAMPTZ NULL   -- cuando aprobó o pidió cambios
```

**Modificación: `patient_portal_tokens`**
- Agregar columna `review_id UUID NULL REFERENCES patient_design_reviews(id)`
- El token apunta al diseño específico → abre directo la sección correcta

**Nueva tabla: `design_review_notifiees`**
```sql
id          UUID PK
profile_id  UUID REFERENCES profiles(id)
notify_on   TEXT[]   -- ['viewed', 'approved', 'revision']
is_active   BOOLEAN DEFAULT TRUE
```
Pre-cargada con: Claudia Fernández (admin), Lourdes Freire (lab), Julián (diseñador).

### 4. Notificaciones
Trigger: cuando la paciente abre el link por primera vez → `viewed_at` se setea → API notifica.
Trigger: cuando aprueba o pide cambios → `status` cambia → API notifica.

**Email** (Resend): asunto + nombre paciente + acción + comentario + link a ficha interna.
**In-app**: badge en campana del panel interno, lista de notificaciones recientes.

---

## UI — Panel interno (`/patients/[id]`)

Nueva tab **"Diseño Digital"**:
- Badge de status con colores: `pending` gris · `viewed` azul · `approved` verde · `revision` ámbar
- Botón "Activar flujo diseño digital" (crea carpeta en Drive)
- Card del diseño vigente: quién subió, cuándo fue vista, comentario de la paciente
- Botones: "Reenviar por WhatsApp" / "Ver diseño como paciente" / "Abrir carpeta Drive"
- Sección STL: escaneo original con botón "Previsualizar" (abre STLViewer existente)

## UI — Portal paciente (`mi-clinica/[token]`)

**Sección "Tu Diseño de Sonrisa":**
- Iframe fullscreen del HTML Exocad (min-height 70vh) + botón "Ver completo" para pantalla entera
- Textarea "Escribí tu opinión (opcional)"
- Botón grande ✅ "Me encanta, apruebo el diseño"
- Botón ✏️ "Quiero hacer cambios"
- Confirmación antes de enviar ("¿Estás segura?")
- Pantalla de confirmación post-respuesta con animación

**Sección "Tu Escaneo Original":**
- STLViewer Three.js existente conectado a los archivos STL de Drive del paciente
- Subtítulo: "Así llegaste al consultorio — [fecha]"
- Autorotate activado, drag para rotar, scroll para zoom

---

## Flujo completo

```
1. Staff activa "Flujo Diseño Digital" en /patients/[id]
   → se crea [EXOCAD]/HTML/ en Drive del paciente

2. Julián sube el .html a esa carpeta (acceso Drive que ya tiene)

3. Staff ve badge "Diseño listo" en la ficha
   → click "Enviar a paciente" → genera token con review_id
   → botón "📱 Enviar por WhatsApp" con mensaje pre-escrito

4. Paciente toca el link → mi-clinica/[token]
   → ve iframe 3D + botones de respuesta

5. Al abrir por primera vez:
   → viewed_at = NOW()
   → email + in-app a Claudia, Lourdes, Julián: "Carolina vio su diseño"

6. Al aprobar o pedir cambios:
   → status actualizado + comentario guardado
   → email + in-app: "Carolina aprobó / pidió cambios"
   → pantalla de confirmación para la paciente
```

---

## Fuera del MVP (segunda etapa)

- Objetivos clínicos del tratamiento (ej: "Ampliar corredor bucal") — se cargan al subir el caso
- Historial de versiones del diseño
- Comparador antes/después (STL original vs diseño)
- Firma digital del paciente

---

## Archivos a crear/modificar

**Nuevos:**
- `supabase/migrations/YYYYMMDD_design_review.sql`
- `app/api/design-review/[patientId]/html/route.ts` (proxy Drive → iframe)
- `app/api/design-review/[patientId]/respond/route.ts` (approved/revision + notify)
- `app/api/design-review/[patientId]/viewed/route.ts` (marcar vista)
- `components/patients/DesignReviewTab.tsx` (tab interna)
- `components/portal-paciente/DesignReviewSection.tsx` (portal paciente)
- `lib/design-review.ts` (helpers: createDriveFolder, getHtmlFileId, notify)

**Modificados:**
- `app/patients/[id]/page.tsx` — agregar tab Diseño Digital
- `app/mi-clinica/[token]/page.tsx` — agregar secciones STL + Diseño de Sonrisa
- `supabase/migrations/` — agregar `review_id` a `patient_portal_tokens`
- `lib/email-templates.ts` — nuevos templates de notificación
