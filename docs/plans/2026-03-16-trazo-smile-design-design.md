# Trazo / Smile Design Annotation Tool — Design

## Goal

Add a non-destructive polyline drawing layer to PhotoStudioModal for clinical smile design annotation, and rename the patient "Archivos" tab to "Documentación".

## Approved Design

### UX / Interaction

- Button `Trazo` in the tools panel (pen icon, Lucide `Pen` or `PenLine`)
- Activating it changes cursor to crosshair over the photo
- Each click adds a point and draws a line to the previous one
- Double-click closes/finishes the current shape (closed polygon)
- Multiple shapes can coexist — each is independent
- Controls: `Deshacer último punto` (Undo last point) + `Borrar trazo` (Clear all)
- Eye toggle 👁 to show/hide the annotation layer
- Default color: white with subtle shadow; 4 color options: white / yellow / cyan / red

### Technical Architecture

- Transparent `<canvas>` overlaid on the photo, same dimensions, `pointer-events` active only when draw mode is on
- Shapes stored as: `{ points: [x, y][], closed: boolean, color: string }[]` in React state
- Coordinates normalized (0–1) relative to displayed image bounds — survives zoom/pan
- On render: redraw all shapes on the overlay canvas after every state change (via `useEffect`)
- On download with layer visible: flatten photo + overlay canvas into an offscreen canvas → JPEG export
- On download with layer hidden: export photo only (existing logic)

### Integration with Existing Tools

- Mutually exclusive with crop, brush, bg-removal — activating draw mode deactivates others
- Global undo captures snapshot before "clear all strokes"
- Strokes are NEVER saved to Drive — they only persist in local React state for the current session
- Strokes survive switching photos in the thumbnail strip only for the same photo (keyed by `file.id`)

### Tab rename

- "Archivos" tab in patient detail → "Documentación"
- Affects the tab label only; component name `PatientDriveTab` stays the same internally
