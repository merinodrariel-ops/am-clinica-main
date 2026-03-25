# Portfolio Mensual del Profesional — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar un editor de portfolio mensual en la ficha del profesional que compila sus prestaciones del mes con fotos (desde Drive o subidas directo), permite background removal/crop, y exporta PDF a Google Drive.

**Architecture:** Botón "Generar Portfolio" en la tarjeta del profesional en PersonalTab abre `PortfolioEditor` (modal full-screen). El editor usa las `prestaciones_realizadas` ya cargadas en el estado local. Las fotos se obtienen desde la carpeta `[FOTO & VIDEO]` del paciente en Drive via server action, o se suben directo (también van a Drive). El PDF se genera en el browser con `html2canvas` + `jsPDF` y se sube a Drive via server action.

**Tech Stack:** `@imgly/background-removal` (browser AI), `html2canvas` + `jspdf` (PDF), `react-image-crop` (crop), Google Drive API (`lib/google-drive.ts`), Next.js Server Actions, Tailwind + `motion/react`.

---

## Contexto crítico para el implementador

- **Cliente Supabase:** browser → `createClient()` de `@/utils/supabase/client`. Server actions → `createClient()` de `@/utils/supabase/server`. Admin bypass → `createAdminClient()` de `@/utils/supabase/admin`. NUNCA `lib/supabase.ts`.
- **Google Drive helpers ya existentes en `lib/google-drive.ts`:**
  - `listFolderFiles(folderId)` — lista archivos de una carpeta
  - `createDriveFolder(drive, parentId, name)` — crea carpeta (idempotente)
  - `uploadToDrive(area, fileName, content, mimeType, subfolder?)` — sube archivo
  - `PACIENTES_ROOT_FOLDER_ID` — ID raíz de carpetas de pacientes
  - `getPatientFolderName(apellido, nombre)` — formatea `"APELLIDO, Nombre"`
  - Estructura de carpetas paciente: `APELLIDO, Nombre` → `[FOTO & VIDEO] APELLIDO, Nombre`
- **`PrestacionRealizada`** (en `lib/caja-admin-prestaciones.ts`): `{ id, profesional_id, paciente_nombre, prestacion_nombre, fecha_realizacion, valor_cobrado, monto_honorarios, moneda_cobro, slides_url, notas, estado_pago }`
- **`paciente_nombre`** se guarda como `"Nombre Apellido"` (ej: `"Carolina Hahn"`). Para buscar la carpeta en Drive hay que invertirlo: buscar con apellido en mayúsculas.
- **Personal** (en `lib/caja-admin/types.ts`): `{ id, nombre, apellido, area, categoria, activo, ... }`
- **Rol del usuario:** `const { categoria } = useAuth()` — NO `role`.
- **Timezone:** Para parsear fechas `YYYY-MM-DD` usar: `const [y,m,d] = str.split('-').map(Number); new Date(y, m-1, d, 12, 0, 0)`.
- **PersonalTab** está en `components/caja-admin/PersonalTab.tsx`. Las prestaciones del mes se cargan en estado `prestacionesByProfesional: Record<string, PrestacionRealizada[]>`.

---

### Task 1: Instalar dependencias

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Instalar paquetes**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
npm install @imgly/background-removal html2canvas jspdf react-image-crop
npm install --save-dev @types/react-image-crop
```

**Step 2: Verificar que se instalaron**

```bash
grep -E "imgly|html2canvas|jspdf|react-image-crop" package.json
```

Expected: 4 líneas con las versiones.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add portfolio dependencies (background-removal, html2canvas, jspdf, react-image-crop)"
```

---

### Task 2: Server actions para Drive photos

**Files:**
- Create: `app/actions/portfolio.ts`

**Step 1: Crear el archivo**

```typescript
'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
    getDriveClient,
    listFolderFiles,
    createDriveFolder,
    PACIENTES_ROOT_FOLDER_ID,
} from '@/lib/google-drive';
import { Readable } from 'stream';

// Busca la carpeta [FOTO & VIDEO] del paciente por nombre parcial
// pacienteNombre = "Carolina Hahn" → busca en Drive "HAHN, Carolina"
export async function getPatientDrivePhotos(pacienteNombre: string): Promise<{
    photos?: Array<{ id: string; name: string; thumbnailLink?: string; webViewLink: string }>;
    error?: string;
}> {
    try {
        // Auth check
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();

        // Convertir "Carolina Hahn" → buscar carpetas que contengan "HAHN"
        const parts = pacienteNombre.trim().split(/\s+/);
        const apellido = parts[parts.length - 1].toUpperCase();

        // Buscar carpeta madre del paciente
        const safeName = apellido.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const foldersRes = await drive.files.list({
            q: `name contains '${safeName}' and '${PACIENTES_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name)',
            pageSize: 10,
        });

        const motherFolder = foldersRes.data.files?.[0];
        if (!motherFolder?.id) return { photos: [] };

        // Buscar subcarpeta [FOTO & VIDEO] dentro de la carpeta madre
        const subRes = await drive.files.list({
            q: `name contains 'FOTO' and '${motherFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name)',
            pageSize: 5,
        });

        const fotoFolder = subRes.data.files?.[0];
        if (!fotoFolder?.id) return { photos: [] };

        // Listar imágenes
        const filesRes = await drive.files.list({
            q: `'${fotoFolder.id}' in parents and trashed=false and (mimeType contains 'image/')`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, webViewLink, thumbnailLink)',
            orderBy: 'createdTime desc',
            pageSize: 50,
        });

        return {
            photos: (filesRes.data.files || []).map(f => ({
                id: f.id!,
                name: f.name!,
                thumbnailLink: f.thumbnailLink || undefined,
                webViewLink: f.webViewLink!,
            })),
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

// Descarga una imagen de Drive y devuelve base64 para mostrar en el browser
export async function getDriveImageBase64(fileId: string): Promise<{
    base64?: string;
    mimeType?: string;
    error?: string;
}> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();
        const metaRes = await drive.files.get({
            fileId,
            supportsAllDrives: true,
            fields: 'mimeType',
        });
        const mimeType = metaRes.data.mimeType || 'image/jpeg';

        const res = await drive.files.get(
            { fileId, supportsAllDrives: true, alt: 'media' },
            { responseType: 'arraybuffer' }
        );
        const buffer = Buffer.from(res.data as ArrayBuffer);
        const base64 = buffer.toString('base64');

        return { base64, mimeType };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

// Sube una foto al folder [FOTO & VIDEO] del paciente en Drive
export async function uploadPhotoToPatientDrive(
    pacienteNombre: string,
    fileName: string,
    base64: string,
    mimeType: string
): Promise<{ webViewLink?: string; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();
        const parts = pacienteNombre.trim().split(/\s+/);
        const apellido = parts[parts.length - 1].toUpperCase();
        const nombre = parts.slice(0, -1).join(' ');

        // Formato canónico de carpeta
        const folderName = apellido && nombre
            ? `${apellido}, ${nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase()}`
            : apellido || nombre;

        // Buscar o crear carpeta madre
        const motherRes = await createDriveFolder(drive, PACIENTES_ROOT_FOLDER_ID, folderName);
        if (motherRes.error || !motherRes.folderId) return { error: motherRes.error };

        // Buscar o crear [FOTO & VIDEO] subfolder
        const fotoFolderName = `[FOTO & VIDEO] ${folderName}`;
        const fotoRes = await createDriveFolder(drive, motherRes.folderId, fotoFolderName);
        if (fotoRes.error || !fotoRes.folderId) return { error: fotoRes.error };

        // Subir imagen
        const buffer = Buffer.from(base64, 'base64');
        const stream = Readable.from(buffer);
        const uploadRes = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [fotoRes.folderId],
            },
            media: { mimeType, body: stream },
            fields: 'id, webViewLink',
        });

        return { webViewLink: uploadRes.data.webViewLink || undefined };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

// Sube el PDF del portfolio a Drive en Portfolios/[Profesional]/[Mes-Año]
export async function uploadPortfolioPdf(
    profesionalNombre: string,
    mes: string, // YYYY-MM
    pdfBase64: string
): Promise<{ webViewLink?: string; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();
        const adminFolder = process.env.GOOGLE_DRIVE_FOLDER_ADMIN || '';
        if (!adminFolder) return { error: 'GOOGLE_DRIVE_FOLDER_ADMIN no configurado' };

        // Portfolios/
        const portfoliosRes = await createDriveFolder(drive, adminFolder, 'Portfolios');
        if (portfoliosRes.error || !portfoliosRes.folderId) return { error: portfoliosRes.error };

        // Portfolios/[Profesional]/
        const profRes = await createDriveFolder(drive, portfoliosRes.folderId, profesionalNombre);
        if (profRes.error || !profRes.folderId) return { error: profRes.error };

        // Portfolios/[Profesional]/[Mes-Año]/
        const [year, month] = mes.split('-');
        const mesNombre = new Date(Number(year), Number(month) - 1, 1)
            .toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        const mesRes = await createDriveFolder(drive, profRes.folderId, mesNombre);
        if (mesRes.error || !mesRes.folderId) return { error: mesRes.error };

        // Subir PDF
        const buffer = Buffer.from(pdfBase64, 'base64');
        const stream = Readable.from(buffer);
        const fileName = `Portfolio ${profesionalNombre} - ${mesNombre}.pdf`;

        const uploadRes = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [mesRes.folderId],
                mimeType: 'application/pdf',
            },
            media: { mimeType: 'application/pdf', body: stream },
            fields: 'id, webViewLink',
        });

        return { webViewLink: uploadRes.data.webViewLink || undefined };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
```

**Step 2: Verificar TypeScript (solo este archivo)**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "portfolio" | head -20
```

Expected: sin errores en `portfolio.ts`.

**Step 3: Commit**

```bash
git add app/actions/portfolio.ts
git commit -m "feat(portfolio): server actions para Drive photos + PDF upload"
```

---

### Task 3: Drive Photo Picker component

**Files:**
- Create: `components/caja-admin/DrivePhotoPicker.tsx`

**Step 1: Crear el componente**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ImageOff } from 'lucide-react';
import { getPatientDrivePhotos, getDriveImageBase64 } from '@/app/actions/portfolio';

interface DrivePhoto {
    id: string;
    name: string;
    thumbnailLink?: string;
    webViewLink: string;
}

interface Props {
    pacienteNombre: string;
    onSelect: (base64: string, mimeType: string, fileName: string) => void;
    onClose: () => void;
}

export default function DrivePhotoPicker({ pacienteNombre, onSelect, onClose }: Props) {
    const [photos, setPhotos] = useState<DrivePhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getPatientDrivePhotos(pacienteNombre).then(res => {
            if (res.error) setError(res.error);
            else setPhotos(res.photos || []);
            setLoading(false);
        });
    }, [pacienteNombre]);

    async function handleSelect(photo: DrivePhoto) {
        setLoadingId(photo.id);
        const res = await getDriveImageBase64(photo.id);
        setLoadingId(null);
        if (res.error || !res.base64) {
            setError(res.error || 'No se pudo cargar la imagen');
            return;
        }
        onSelect(res.base64, res.mimeType || 'image/jpeg', photo.name);
    }

    return (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div>
                        <p className="text-white font-medium">Fotos de Drive</p>
                        <p className="text-white/40 text-sm">{pacienteNombre}</p>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading && (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                        </div>
                    )}
                    {error && <p className="text-red-400 text-sm text-center py-8">{error}</p>}
                    {!loading && !error && photos.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-white/30">
                            <ImageOff className="w-8 h-8 mb-2" />
                            <p className="text-sm">No se encontraron fotos en Drive</p>
                        </div>
                    )}
                    {!loading && photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {photos.map(photo => (
                                <button
                                    key={photo.id}
                                    onClick={() => handleSelect(photo)}
                                    disabled={loadingId === photo.id}
                                    className="relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-white/40 transition-all group"
                                >
                                    {photo.thumbnailLink ? (
                                        // eslint-disable-next-line @next/next-image
                                        <img
                                            src={photo.thumbnailLink}
                                            alt={photo.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                            <ImageOff className="w-6 h-6 text-white/20" />
                                        </div>
                                    )}
                                    {loadingId === photo.id && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Verificar TypeScript**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "DrivePhotoPicker" | head -10
```

Expected: sin errores.

**Step 3: Commit**

```bash
git add components/caja-admin/DrivePhotoPicker.tsx
git commit -m "feat(portfolio): DrivePhotoPicker component para seleccionar fotos del paciente"
```

---

### Task 4: PortfolioEditor — estructura y sidebar

**Files:**
- Create: `components/caja-admin/PortfolioEditor.tsx`

Este es el componente principal. Se implementa en dos pasos (Task 4 = estructura + sidebar, Task 5 = generación PDF + subida).

**Step 1: Crear el archivo con estructura y sidebar**

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Upload, Trash2, Loader2, CheckCircle, ExternalLink, FolderOpen, Wand2, Check } from 'lucide-react';
import type { PrestacionRealizada } from '@/lib/caja-admin-prestaciones';
import type { Personal } from '@/lib/caja-admin/types';
import DrivePhotoPicker from './DrivePhotoPicker';
import { uploadPhotoToPatientDrive, uploadPortfolioPdf } from '@/app/actions/portfolio';
import { toast } from 'sonner';

// NOTE: jsPDF and html2canvas are loaded dynamically to avoid SSR issues

interface PortfolioPhoto {
    base64: string;
    mimeType: string;
    fileName: string;
    processed?: boolean; // background removed
}

interface PortfolioEntry {
    prestacion: PrestacionRealizada;
    photos: PortfolioPhoto[];
}

interface Props {
    profesional: Personal;
    prestaciones: PrestacionRealizada[];
    mes: string; // YYYY-MM
    onClose: () => void;
}

export default function PortfolioEditor({ profesional, prestaciones, mes, onClose }: Props) {
    // Sort by fecha_realizacion ascending
    const sorted = [...prestaciones].sort((a, b) =>
        (a.fecha_realizacion || '').localeCompare(b.fecha_realizacion || '')
    );

    const [entries, setEntries] = useState<PortfolioEntry[]>(
        sorted.map(p => ({ prestacion: p, photos: [] }))
    );
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    const [processingBg, setProcessingBg] = useState<number | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exported, setExported] = useState(false);
    const [exportedUrl, setExportedUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    const currentEntry = entries[selectedIdx];

    // Add photo from base64 (from Drive or upload)
    function addPhoto(base64: string, mimeType: string, fileName: string) {
        setEntries(prev => prev.map((e, i) =>
            i === selectedIdx
                ? { ...e, photos: [...e.photos, { base64, mimeType, fileName }] }
                : e
        ));
    }

    // Remove photo
    function removePhoto(photoIdx: number) {
        setEntries(prev => prev.map((e, i) =>
            i === selectedIdx
                ? { ...e, photos: e.photos.filter((_, pi) => pi !== photoIdx) }
                : e
        ));
    }

    // Handle file upload (drag or click)
    async function handleFileUpload(files: FileList | null) {
        if (!files || files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            const base64 = dataUrl.split(',')[1];
            addPhoto(base64, file.type, file.name);
            // Upload to Drive in background (no await - fire and forget)
            if (currentEntry?.prestacion.paciente_nombre) {
                uploadPhotoToPatientDrive(
                    currentEntry.prestacion.paciente_nombre,
                    file.name,
                    base64,
                    file.type
                ).catch(() => { /* silent fail */ });
            }
        };
        reader.readAsDataURL(file);
    }

    // Background removal using @imgly/background-removal
    async function removeBackground(photoIdx: number) {
        setProcessingBg(photoIdx);
        try {
            // Dynamic import to avoid SSR
            const { removeBackground: removeBg } = await import('@imgly/background-removal');
            const photo = currentEntry.photos[photoIdx];
            const blob = base64ToBlob(photo.base64, photo.mimeType);
            const resultBlob = await removeBg(blob);
            const newBase64 = await blobToBase64(resultBlob);
            setEntries(prev => prev.map((e, i) =>
                i === selectedIdx
                    ? {
                        ...e,
                        photos: e.photos.map((p, pi) =>
                            pi === photoIdx
                                ? { ...p, base64: newBase64, mimeType: 'image/png', processed: true }
                                : p
                        )
                    }
                    : e
            ));
        } catch (err) {
            toast.error('Error al remover fondo');
            console.error(err);
        } finally {
            setProcessingBg(null);
        }
    }

    // Handle drag over
    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Handle drop
    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        handleFileUpload(e.dataTransfer.files);
    }

    function formatDate(dateStr: string) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-AR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    return (
        <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                <div>
                    <h2 className="text-white font-semibold text-lg">Portfolio Mensual</h2>
                    <p className="text-white/40 text-sm">
                        {profesional.nombre} {profesional.apellido} —{' '}
                        {(() => {
                            const [y, m] = mes.split('-').map(Number);
                            return new Date(y, m - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
                        })()}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        entries={entries}
                        profesional={profesional}
                        mes={mes}
                        exporting={exporting}
                        exported={exported}
                        exportedUrl={exportedUrl}
                        setExporting={setExporting}
                        setExported={setExported}
                        setExportedUrl={setExportedUrl}
                        previewRef={previewRef}
                    />
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar: list of prestaciones */}
                <div className="w-64 shrink-0 border-r border-white/10 overflow-y-auto">
                    {entries.map((entry, idx) => (
                        <button
                            key={entry.prestacion.id}
                            onClick={() => setSelectedIdx(idx)}
                            className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                                idx === selectedIdx ? 'bg-white/10' : 'hover:bg-white/5'
                            }`}
                        >
                            <p className="text-white text-sm font-medium truncate">{entry.prestacion.prestacion_nombre}</p>
                            <p className="text-white/40 text-xs truncate">{entry.prestacion.paciente_nombre}</p>
                            <p className="text-white/30 text-xs">
                                {entry.prestacion.fecha_realizacion
                                    ? formatDate(entry.prestacion.fecha_realizacion)
                                    : 'Sin fecha'}
                            </p>
                            {entry.photos.length > 0 && (
                                <span className="inline-block mt-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded">
                                    {entry.photos.length} foto{entry.photos.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Main editor area */}
                {currentEntry && (
                    <div className="flex-1 overflow-y-auto p-6">
                        {/* Entry info */}
                        <div className="mb-6">
                            <h3 className="text-white text-xl font-semibold">{currentEntry.prestacion.prestacion_nombre}</h3>
                            <p className="text-white/50 text-sm mt-1">
                                {currentEntry.prestacion.paciente_nombre}
                                {currentEntry.prestacion.fecha_realizacion && (
                                    <> · {formatDate(currentEntry.prestacion.fecha_realizacion)}</>
                                )}
                            </p>
                            {currentEntry.prestacion.notas && (
                                <p className="text-white/40 text-sm mt-2 italic">{currentEntry.prestacion.notas}</p>
                            )}
                        </div>

                        {/* Photos grid */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            {currentEntry.photos.map((photo, photoIdx) => (
                                <div key={photoIdx} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group">
                                    {/* eslint-disable-next-line @next/next-image */}
                                    <img
                                        src={`data:${photo.mimeType};base64,${photo.base64}`}
                                        alt={photo.fileName}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                        <button
                                            onClick={() => removeBackground(photoIdx)}
                                            disabled={processingBg === photoIdx}
                                            title="Remover fondo"
                                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                                        >
                                            {processingBg === photoIdx
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Wand2 className="w-4 h-4" />
                                            }
                                        </button>
                                        <button
                                            onClick={() => removePhoto(photoIdx)}
                                            title="Eliminar"
                                            className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded-lg transition-colors text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {photo.processed && (
                                        <div className="absolute top-2 right-2">
                                            <span className="px-1.5 py-0.5 bg-purple-500/30 text-purple-300 text-[10px] rounded">sin fondo</span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Upload slot */}
                            <div
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                className="aspect-square rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer group"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="w-6 h-6 text-white/30 group-hover:text-white/60 transition-colors" />
                                <span className="text-white/30 text-xs group-hover:text-white/50 transition-colors text-center">
                                    Subir foto<br />o arrastrar
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => handleFileUpload(e.target.files)}
                                />
                            </div>

                            {/* Drive picker slot */}
                            {currentEntry.prestacion.paciente_nombre && (
                                <button
                                    onClick={() => setShowDrivePicker(true)}
                                    className="aspect-square rounded-xl border-2 border-dashed border-blue-500/30 hover:border-blue-500/60 transition-colors flex flex-col items-center justify-center gap-2 group"
                                >
                                    <FolderOpen className="w-6 h-6 text-blue-400/50 group-hover:text-blue-400 transition-colors" />
                                    <span className="text-blue-400/50 text-xs group-hover:text-blue-400 transition-colors text-center">
                                        Desde Drive
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden preview for PDF generation */}
            <PortfolioPrintPreview ref={previewRef} entries={entries} profesional={profesional} mes={mes} />

            {/* Drive Picker Modal */}
            <AnimatePresence>
                {showDrivePicker && currentEntry?.prestacion.paciente_nombre && (
                    <DrivePhotoPicker
                        pacienteNombre={currentEntry.prestacion.paciente_nombre}
                        onSelect={(base64, mimeType, fileName) => {
                            addPhoto(base64, mimeType, fileName);
                            setShowDrivePicker(false);
                        }}
                        onClose={() => setShowDrivePicker(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ---- Export Button (separated for clarity) ----
interface ExportButtonProps {
    entries: PortfolioEntry[];
    profesional: Personal;
    mes: string;
    exporting: boolean;
    exported: boolean;
    exportedUrl: string | null;
    setExporting: (v: boolean) => void;
    setExported: (v: boolean) => void;
    setExportedUrl: (v: string | null) => void;
    previewRef: React.RefObject<HTMLDivElement | null>;
}

function ExportButton({ entries, profesional, mes, exporting, exported, exportedUrl, setExporting, setExported, setExportedUrl, previewRef }: ExportButtonProps) {
    async function handleExport() {
        setExporting(true);
        try {
            const [html2canvas, { jsPDF }] = await Promise.all([
                import('html2canvas').then(m => m.default),
                import('jspdf'),
            ]);

            if (!previewRef.current) return;

            // Show the preview div temporarily
            previewRef.current.style.display = 'block';
            await new Promise(r => setTimeout(r, 100)); // allow render

            const canvas = await html2canvas(previewRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#0a0a0a',
            });

            previewRef.current.style.display = 'none';

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            // Split into pages if needed
            const pageHeight = pdf.internal.pageSize.getHeight();
            let yOffset = 0;
            while (yOffset < pdfHeight) {
                if (yOffset > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, -yOffset, pdfWidth, pdfHeight);
                yOffset += pageHeight;
            }

            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            const profesionalNombre = `${profesional.nombre} ${profesional.apellido}`;
            const result = await uploadPortfolioPdf(profesionalNombre, mes, pdfBase64);

            if (result.error) {
                toast.error(`Error al subir PDF: ${result.error}`);
            } else {
                setExported(true);
                setExportedUrl(result.webViewLink || null);
                toast.success('Portfolio exportado a Drive');
            }
        } catch (err) {
            console.error(err);
            toast.error('Error al generar PDF');
        } finally {
            setExporting(false);
        }
    }

    if (exported && exportedUrl) {
        return (
            <a
                href={exportedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors"
            >
                <Check className="w-4 h-4" />
                Ver en Drive
                <ExternalLink className="w-3 h-3" />
            </a>
        );
    }

    return (
        <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {exporting ? 'Generando PDF...' : 'Exportar a Drive'}
        </button>
    );
}

// ---- Print Preview (hidden, used for PDF generation) ----
import { forwardRef } from 'react';

const PortfolioPrintPreview = forwardRef<HTMLDivElement, {
    entries: PortfolioEntry[];
    profesional: Personal;
    mes: string;
}>(function PortfolioPrintPreview({ entries, profesional, mes }, ref) {
    function formatDate(dateStr: string) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-AR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    const mesLabel = (() => {
        const [y, m] = mes.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
    })();

    return (
        <div
            ref={ref}
            style={{ display: 'none', background: '#0a0a0a', padding: '40px', color: 'white', width: '794px', fontFamily: 'sans-serif' }}
        >
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
                    {profesional.nombre} {profesional.apellido}
                </h1>
                <p style={{ color: '#888', margin: '4px 0 0', textTransform: 'capitalize' }}>{mesLabel}</p>
            </div>

            {/* Entries */}
            {entries.map((entry, idx) => (
                <div key={idx} style={{ marginBottom: 40, borderTop: '1px solid #222', paddingTop: 24 }}>
                    <div style={{ marginBottom: 12 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{entry.prestacion.prestacion_nombre}</h2>
                        <p style={{ color: '#888', margin: '4px 0 0', fontSize: 14 }}>
                            {entry.prestacion.paciente_nombre}
                            {entry.prestacion.fecha_realizacion && (
                                <> · {formatDate(entry.prestacion.fecha_realizacion)}</>
                            )}
                        </p>
                    </div>
                    {entry.photos.length > 0 && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {entry.photos.map((photo, pi) => (
                                <img
                                    key={pi}
                                    src={`data:${photo.mimeType};base64,${photo.base64}`}
                                    alt={photo.fileName}
                                    style={{ width: 220, height: 180, objectFit: 'cover', borderRadius: 8 }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
});

// ---- Utilities ----
function base64ToBlob(base64: string, mimeType: string): Blob {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
```

**Step 2: Verificar TypeScript**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "PortfolioEditor\|DrivePhotoPicker" | head -20
```

Expected: sin errores.

**Step 3: Commit**

```bash
git add components/caja-admin/PortfolioEditor.tsx
git commit -m "feat(portfolio): PortfolioEditor modal con fotos, background removal y export PDF"
```

---

### Task 5: Wiring en PersonalTab

**Files:**
- Modify: `components/caja-admin/PersonalTab.tsx`

**Step 1: Agregar state e imports**

Agregar al bloque de imports existente:
```typescript
import PortfolioEditor from '@/components/caja-admin/PortfolioEditor';
```

Agregar al bloque de state (cerca de `expandedPrestaciones`):
```typescript
const [portfolioModal, setPortfolioModal] = useState<{ profesional: Personal; prestaciones: PrestacionRealizada[] } | null>(null);
```

**Step 2: Agregar botón en la tarjeta del profesional**

Buscar el botón de liquidación en la tarjeta del profesional (cerca de `handleGenerarLiquidacion` o similar). Justo después del bloque de acciones de liquidación, agregar:

```tsx
{/* Botón Portfolio */}
{(prestacionesByProfesional[worker.id] || []).length > 0 && (
    <button
        onClick={() => setPortfolioModal({
            profesional: worker,
            prestaciones: prestacionesByProfesional[worker.id] || []
        })}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 rounded-lg transition-colors"
    >
        <span>Portfolio</span>
    </button>
)}
```

**Step 3: Agregar el modal al final del JSX (antes del `</div>` de cierre del componente)**

```tsx
{/* Portfolio Editor Modal */}
{portfolioModal && (
    <PortfolioEditor
        profesional={portfolioModal.profesional}
        prestaciones={portfolioModal.prestaciones}
        mes={selectedMes}
        onClose={() => setPortfolioModal(null)}
    />
)}
```

> **Nota:** `selectedMes` es la variable de estado que guarda el mes seleccionado actualmente en PersonalTab (buscar el estado que controla el selector de mes — suele llamarse `selectedMes`, `mesActual`, o similar).

**Step 4: Verificar TypeScript**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit 2>&1 | grep "PersonalTab\|portfolio\|Portfolio" | head -20
```

Expected: sin errores.

**Step 5: Commit**

```bash
git add components/caja-admin/PersonalTab.tsx
git commit -m "feat(portfolio): botón Portfolio en tarjeta del profesional + wiring del modal"
```

---

## Testing manual (checklist)

- [ ] Abrir Caja Admin → Personal → tarjeta de un profesional con prestaciones del mes → botón "Portfolio" aparece
- [ ] Click en "Portfolio" → abre PortfolioEditor con lista de prestaciones en sidebar
- [ ] Click en una prestación → muestra info del paciente y fecha
- [ ] Drag and drop de una foto en el slot de upload → foto aparece en el grid
- [ ] Botón "Wand" (remover fondo) en una foto → foto se procesa (puede tardar ~3-10s)
- [ ] Botón "Desde Drive" → abre DrivePhotoPicker con fotos del paciente (si tiene carpeta en Drive)
- [ ] Botón "Exportar a Drive" → genera PDF y aparece "Ver en Drive" con link
- [ ] Link "Ver en Drive" abre el PDF en Drive correctamente

