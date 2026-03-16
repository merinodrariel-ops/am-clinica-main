# Trazo v2 — Design

## Goal

Upgrade the existing polyline draw tool in PhotoStudioModal to a proper smile-design annotation tool: smooth Catmull-Rom curves, per-point corner/smooth toggle, live rubber-band preview, point drag editing, and shape copy/paste.

## Approved Design

### Drawing mode
- Click to place points; a rubber-band line follows the mouse from the last placed point to the current cursor position in real time
- Segments are **smooth by default** (Catmull-Rom splines passing through each point)
- Line width: **1.5 px** (down from current ~2–4 px)

### Closing a shape
- Double-click closes the shape and enters **edit mode**
- The duplicate point added by the second click of the double-click is discarded before closing

### Edit mode (shape is closed)
- Points rendered as draggable handles: **circle** = smooth, **square** = sharp corner
- Drag any handle to reposition it; the Catmull-Rom curve updates live
- **Double-click a point** → toggle smooth ↔ sharp
- Click elsewhere on the canvas (not on a handle) → deselect shape, return to idle
- Click on a closed shape → re-select it for editing

### Copy / paste
- **Cmd+C** while a shape is selected → stores a deep copy in `drawClipboard` state
- **Cmd+V** → pastes the clipboard shape offset by (+2%, +2%) in normalized coordinates (roughly 20 px on a typical image)
- Pasted shape is immediately selected (enters edit mode)
- Works for multiple pastes in succession (each shifted +2%, +2% more)

### Data model
```ts
interface DrawPoint {
    x: number;       // normalized 0–1
    y: number;       // normalized 0–1
    smooth: boolean; // true = Catmull-Rom tangent, false = sharp corner
}

interface DrawShape {
    id: string;
    points: DrawPoint[];
    closed: boolean;
    color: DrawColor;
}
```

### Rendering (Canvas 2D)
- For each shape, build the path using Catmull-Rom → cubic bezier conversion for smooth points; straight `lineTo` into/out of sharp points
- Shadow: `rgba(0,0,0,0.5)` blur 2 for visibility on light backgrounds
- In edit mode, render handle dots on top: white circle (smooth) or white square (sharp), 5 px radius/half-side

### State machine
| State | Description |
|-------|-------------|
| `idle` | No shape being drawn; click on existing closed shape to select |
| `drawing` | Placing points; mouse move shows rubber-band line |
| `editing` | Shape closed; drag handles, dbl-click to toggle smooth/sharp |

### Integration
- Mutual exclusion with crop/brush unchanged
- `resetEdits` clears all draw state
- Export: flatten visible annotation layer as before
- `isDirty` includes draw shapes as before

## Files
- Modify: `components/patients/drive/PhotoStudioModal.tsx` — replace v1 draw implementation
