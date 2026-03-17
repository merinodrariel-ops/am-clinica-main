# Canvas Compositor — Design Document

**Fecha:** 2026-03-17

## Resumen

Módulo de composición de imágenes integrado dentro del `PhotoStudioModal` existente. Permite al equipo de AM Clínica crear comparativos antes/después y artes para redes sociales arrastrando fotos del paciente sobre un lienzo en blanco con proporciones predefinidas.

---

## Contexto

El `PhotoStudioModal` ya tiene:
- Edición de foto individual (crop, brillo, remoción de fondo)
- Herramientas de trazo (brush, lápiz, pluma, etc.)
- Anotaciones de texto
- Guardado en Drive + descarga

El Canvas Compositor se agrega como un **segundo modo** dentro del mismo modal, accesible via un switcher de tabs en el header.

---

## Diseño aprobado

### Estructura general

Switcher en el header del modal:

```
[ Editar Foto ]  [ Canvas ]
```

Al activar "Canvas":
- El área central muestra un lienzo blanco con la proporción seleccionada
- La tira de miniaturas de abajo sigue siendo la fuente de fotos
- El panel derecho (ToolsPanel) agrega sección "Lienzo" con selector de proporción

### Proporciones de canvas

| Nombre | Ratio | Uso |
|--------|-------|-----|
| Instagram Post | 1:1 | Feed cuadrado |
| Instagram Portrait | 4:5 | Feed vertical (más alcance) |
| Story / Reels | 9:16 | Historias y Reels |
| Presentación | 16:9 | Pantalla, proyección |

El canvas arranca en 1:1 por defecto. Cambiar proporción reescala las capas proporcionalmente.

### Capas (layers)

Cada foto agregada al canvas es una capa independiente con estado:

```ts
interface CanvasLayer {
  id: string;
  type: 'photo' | 'text' | 'drawing';
  src: string;           // blob URL o data URL
  x: number;             // normalizado 0–1
  y: number;
  width: number;         // normalizado 0–1
  height: number;
  rotation: number;      // grados
  zIndex: number;
}
```

### Agregar fotos al canvas

1. **Drag desde tira de miniaturas** — el thumbnail se arrastra y suelta sobre el canvas
2. **Drag desde PC** — drop directo sobre el canvas (mismo patrón que drag-and-drop de uploads)
3. **Cmd+C / Cmd+V** — copiar foto del editor y pegar en canvas

### Manipulación de capas

- **Mover** — drag sobre la capa
- **Redimensionar** — handles en las 4 esquinas
- **Rotar** — Cmd + arrastrar esquina
- **Orden Z** — clic derecho → "Traer al frente / Enviar atrás"
- **Eliminar** — clic derecho → "Eliminar" o tecla Delete
- **Multi-select** — Cmd+click (ya implementado en editor)

### Herramientas sobre el canvas

Las herramientas de texto y trazo existentes (brush, lápiz, pluma, taper, velocity) se aplican como una capa de anotación encima de todas las fotos — igual que en el editor de foto individual.

### Guardar y exportar

- **Guardar en Drive** — mismo modal de guardado actual, exporta como PNG/JPG plano
- **Descargar** — descarga al dispositivo
- **Aviso de cambios sin guardar** — al cerrar el modal, igual que el editor actual

---

## Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `components/patients/drive/PhotoStudioModal.tsx` | Agregar tab switcher + modo canvas |
| `components/patients/drive/CanvasCompositor.tsx` | **Nuevo** — componente del lienzo |

El `CanvasCompositor` recibe:
- `files: DriveFile[]` — fotos disponibles del paciente
- `onSave: (blob: Blob) => void` — para guardar/descargar
- Proporción seleccionada como estado interno

---

## Decisiones de diseño

| Decisión | Alternativa descartada | Razón |
|----------|----------------------|-------|
| Tab dentro de PhotoStudioModal | Modal separado | Mantiene contexto, reutiliza herramientas y tira de fotos |
| Canvas renderizado con HTML Canvas 2D | CSS absolute layers | Consistente con el editor actual, export directo con toDataURL |
| Capas normalizadas (0–1) | Píxeles absolutos | Independiente de resolución, igual que el editor |
| 4 proporciones fijas | Tamaño libre custom | YAGNI — las 4 cubren el 95% de los casos de uso |
