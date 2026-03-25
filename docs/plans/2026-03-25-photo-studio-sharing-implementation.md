# Photo Studio Sharing UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar seleccion multiple real en el lateral izquierdo de Photo Studio y unificar el compartir por AirDrop o al paciente usando la version visible/editada de las fotos.

**Architecture:** La implementacion se concentra en `PhotoStudioModal`, que ya conoce la foto activa, el canvas y el pipeline de export. Se agrega una capa de seleccion multiple y un menu contextual inteligente sobre miniaturas. Luego se extrae/reutiliza una misma resolucion de archivos exportables para alimentar tanto el share nativo como el modal de envio al paciente.

**Tech Stack:** Next.js App Router, React 19, TypeScript 5, Sonner, lucide-react, browser Web Share API, componentes client-side en `components/patients/drive`.

---

### Task 1: Pasar contexto del paciente hasta Photo Studio

**Files:**
- Modify: `components/patients/drive/DrivePreviewModal.tsx`
- Modify: `components/patients/drive/PatientDriveTab.tsx`
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Write the failing type check mentally / in editor**

Agregar props requeridas en `PhotoStudioModal`:

```ts
patientId: string;
patientName: string;
```

Y usarlas en `DrivePreviewModal` sin haber actualizado el llamado. TypeScript deberia marcar props faltantes.

**Step 2: Run type-aware check for touched files**

Run: `npm run build`
Expected: FAIL con error de props faltantes para `PhotoStudioModal`.

**Step 3: Wire minimal implementation**

- Pasar `patientId` y `patientName` desde `PatientDriveTab` hacia `DrivePreviewModal`.
- Reenviarlas desde `DrivePreviewModal` hacia `PhotoStudioModal`.
- Guardar esas props en `PhotoStudioModal` para uso posterior.

**Step 4: Run build again**

Run: `npm run build`
Expected: vuelve a fallar por tareas siguientes, pero no por falta de props.

**Step 5: Commit**

```bash
git add components/patients/drive/PatientDriveTab.tsx components/patients/drive/DrivePreviewModal.tsx components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat: pass patient context into photo studio"
```

---

### Task 2: Implementar seleccion multiple natural en miniaturas

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add failing interaction scaffolding**

Introducir estado explicito para:

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
```

Y reemplazar el click actual de miniatura por un handler dedicado `handleThumbnailSelect` sin logica completa todavia.

**Step 2: Run build to expose missing references**

Run: `npm run build`
Expected: FAIL por handler incompleto o referencias nuevas.

**Step 3: Write minimal implementation**

Implementar `handleThumbnailSelect(fileId, event)` con estas reglas:
- click simple -> abrir foto y resetear seleccion a esa foto o vaciarla segun UX elegida
- `event.shiftKey` -> seleccionar rango desde `selectionAnchorId`
- `event.metaKey || event.ctrlKey` -> toggle individual
- actualizar `selectionAnchorId` en cada seleccion explicita

Tambien agregar estilos visibles a miniaturas seleccionadas y contador visible cuando `selectedIds.size > 1`.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS en esta parte; si falla, corregir tipos/eventos.

**Step 5: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat: add multi-select thumbnails in photo studio"
```

---

### Task 3: Hacer que el menu contextual opere sobre una o varias fotos

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add failing helper signatures**

Agregar helper:

```ts
function getContextTargetIds(clickedId: string): string[] {
  return [];
}
```

Y reemplazar el menu contextual actual para depender de esa funcion.

**Step 2: Run build**

Run: `npm run build`
Expected: PASS o FAIL por uso incompleto del helper.

**Step 3: Write minimal implementation**

Reglas:
- si `selectedIds` contiene `clickedId` y hay mas de una seleccion, devolver todas las seleccionadas
- si no, devolver solo `clickedId`

Actualizar el menu contextual de miniaturas para incluir:
- `Duplicar foto`
- `Compartir por AirDrop`
- `Compartir con paciente`

Mostrar copy contextual como `Compartir 1 foto` / `Compartir 5 fotos` si ayuda.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS.

**Step 5: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat: extend thumbnail context menu with sharing actions"
```

---

### Task 4: Unificar export de fotos visibles para share individual o por lote

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add failing helper skeletons**

Agregar helpers con tipos concretos:

```ts
type ExportablePhoto = {
  id: string;
  name: string;
  file: File;
};

async function exportVisiblePhotos(targetIds: string[]): Promise<ExportablePhoto[]> {
  return [];
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: PASS o FAIL por funciones no usadas aun.

**Step 3: Write minimal implementation**

- Reusar el pipeline existente de `exportToBlob()` / `exportCanvasToBlob()` para la foto activa.
- Para fotos no activas, resolver una estrategia simple y consistente:
  - si existe estado editable persistido por foto, exportarlo;
  - si no existe, usar blob original desde `/api/drive/file/:id`.
- Encapsular nombres de archivo consistentes (`<base>.jpg` o `.png`).

Si el estado editable actual solo existe para la foto activa, documentar esa limitacion en codigo y cubrir el caso visible del usuario: al cambiar de foto ya se guarda/restaura estado editable por archivo antes de compartir.

**Step 4: Wire AirDrop handler to use exported files**

Reemplazar `handleShare()` por una variante que acepte lote objetivo y use `navigator.share({ files })` cuando sea posible.

**Step 5: Run build**

Run: `npm run build`
Expected: PASS.

**Step 6: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat: export visible photo selections for sharing"
```

---

### Task 5: Conectar `Compartir por AirDrop` al menu contextual y toolbar

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add failing plumbing**

Crear `handleShareTargets(targetIds: string[])` y hacer que el boton superior `Compartir` lo use con la foto activa/seleccion actual. Hacer que el menu contextual lo use tambien.

**Step 2: Run build**

Run: `npm run build`
Expected: PASS o FAIL por firmas inconsistentes.

**Step 3: Write minimal implementation**

- Toolbar: comparte seleccion actual si hay multiples; si no, comparte foto activa.
- Context menu: comparte ids resueltos por `getContextTargetIds`.
- Fallback sin Web Share API: descarga archivos con feedback claro usando `toast.info(...)`.

**Step 4: Manual UI check**

Verificar en browser:
- una foto -> share normal
- multiples -> share por lote

**Step 5: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat: share selected photos via native share"
```

---

### Task 6: Extender `ShareWithPatientModal` para lote de imagenes

**Files:**
- Modify: `components/patients/drive/ShareWithPatientModal.tsx`
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add failing interface changes**

Cambiar props del modal desde:

```ts
file: DriveFile;
```

a una forma compatible con lote:

```ts
files: Array<{
  id: string;
  name: string;
  file?: File;
  driveFileId?: string;
}>;
```

**Step 2: Run build**

Run: `npm run build`
Expected: FAIL en todos los llamados existentes al modal.

**Step 3: Write minimal implementation**

- Mantener compatibilidad para el caso singular desde `PatientDriveTab` adaptando el llamado a `files={[...]}`.
- Desde `PhotoStudioModal`, abrir el modal con los archivos exportados del lote.
- Ajustar header/copy del modal para mostrar `1 archivo` o `N archivos`.

**Step 4: Preserve current contact/message logic**

No cambiar la logica de canal, telefono, email, mensaje sugerido ni programacion, salvo lo necesario para soportar lote.

**Step 5: Run build**

Run: `npm run build`
Expected: PASS.

**Step 6: Commit**

```bash
git add components/patients/drive/ShareWithPatientModal.tsx components/patients/drive/PhotoStudioModal.tsx components/patients/drive/PatientDriveTab.tsx
git commit -m "feat: support sharing multiple photos with patients"
```

---

### Task 7: Resolver envio programado con archivos exportados desde el editor

**Files:**
- Modify: `components/patients/drive/ShareWithPatientModal.tsx`
- Check: `app/actions/scheduled-messages.ts`

**Step 1: Inspect current action contract**

Leer `app/actions/scheduled-messages.ts` y verificar si hoy acepta un solo `mediaUrl` o si requiere extension.

**Step 2: If action already supports only one mediaUrl, choose the smallest safe path**

Implementar una de estas estrategias, priorizando la mas chica que cumpla el objetivo:
- multiples mensajes programados, uno por archivo, bajo una sola accion del usuario;
- o una extension simple del payload para soportar multiples URLs/adjuntos.

**Step 3: Write minimal implementation**

La UX debe seguir sintiendose como un solo envio programado, aunque internamente cree varios registros si el backend actual lo requiere.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS.

**Step 5: Commit**

```bash
git add components/patients/drive/ShareWithPatientModal.tsx app/actions/scheduled-messages.ts
git commit -m "feat: schedule patient sharing for photo batches"
```

---

### Task 8: Refinar copy y estados visuales

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`
- Modify: `components/patients/drive/ShareWithPatientModal.tsx`

**Step 1: Add polish items**

- contador de seleccion
- labels `Compartir por AirDrop` y `Compartir con paciente`
- header del modal con cantidad de imagenes
- toasts mas claros para lote vs individual

**Step 2: Run build**

Run: `npm run build`
Expected: PASS.

**Step 3: Manual UI pass**

Probar:
- una foto
- varias con `Shift`
- varias con `Cmd/Ctrl`
- menu contextual
- toolbar share
- share con paciente

**Step 4: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx components/patients/drive/ShareWithPatientModal.tsx
git commit -m "feat: polish photo studio sharing interactions"
```

---

### Task 9: Validacion final

**Files:**
- Check: `components/patients/drive/PhotoStudioModal.tsx`
- Check: `components/patients/drive/ShareWithPatientModal.tsx`
- Check: `components/patients/drive/DrivePreviewModal.tsx`
- Check: `components/patients/drive/PatientDriveTab.tsx`

**Step 1: Run full build**

Run: `npm run build`
Expected: PASS.

**Step 2: Run targeted grep sanity checks**

Run: `rg "profiles\.role|useAuth\(\)\.role|worker\.rol" components app`
Expected: no new matches introduced in touched code.

**Step 3: Manual UI checklist**

- `Shift + click` selecciona rango
- `Cmd/Ctrl + click` suma o resta
- clic derecho sobre seleccion aplica al grupo
- AirDrop comparte lote
- compartir con paciente usa mensaje sugerido y programacion
- fotos compartidas reflejan lo visible

**Step 4: Final commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx components/patients/drive/ShareWithPatientModal.tsx components/patients/drive/DrivePreviewModal.tsx components/patients/drive/PatientDriveTab.tsx
git commit -m "feat: unify photo studio sharing workflows"
```
