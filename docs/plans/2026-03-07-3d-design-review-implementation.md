# 3D Design Review Portal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Que las pacientes vean su escaneo STL original y el diseño de sonrisa (HTML Exocad) en su portal `mi-clinica/[token]`, puedan aprobar/pedir cambios, y el staff reciba notificaciones en tiempo real.

**Architecture:** HTML de Exocad vive en Google Drive (`[EXOCAD]/HTML/` del paciente), servido via proxy API seguro. Estado de revisión y comentarios en tabla `patient_design_reviews`. Token de portal existente extendido con `review_id`. STL viewer existente conectado al portal del paciente.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), Google Drive API (OAuth), Resend (email), Three.js (STL viewer ya existe), Framer Motion, Tailwind CSS 4.

---

## Task 1: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20260307220000_design_review.sql`

**Step 1: Crear el archivo de migración**

```sql
-- patient_design_reviews: estado de revisión de cada diseño de sonrisa
CREATE TABLE IF NOT EXISTS public.patient_design_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
  drive_html_file_id  TEXT NULL,        -- ID del archivo HTML en Drive
  exocad_folder_id    TEXT NULL,        -- ID de la carpeta [EXOCAD]/HTML/ en Drive
  label               TEXT NOT NULL DEFAULT 'Diseño de Sonrisa',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'viewed', 'approved', 'revision')),
  patient_comment     TEXT NULL,
  uploaded_by         UUID NULL REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at           TIMESTAMPTZ NULL,
  responded_at        TIMESTAMPTZ NULL
);

ALTER TABLE public.patient_design_reviews ENABLE ROW LEVEL SECURITY;

-- Staff puede ver y crear registros
CREATE POLICY "design_reviews_staff_all"
ON public.patient_design_reviews FOR ALL
USING (get_my_role() = ANY(ARRAY['owner','admin','reception','developer','asistente']))
WITH CHECK (get_my_role() = ANY(ARRAY['owner','admin','reception','developer','asistente']));

-- Agregar review_id a patient_portal_tokens
ALTER TABLE public.patient_portal_tokens
ADD COLUMN IF NOT EXISTS review_id UUID NULL REFERENCES public.patient_design_reviews(id);

-- Notifiees: quiénes reciben notificaciones (pre-cargado con Claudia, Lourdes, Julián)
CREATE TABLE IF NOT EXISTS public.design_review_notifiees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notify_on   TEXT[] NOT NULL DEFAULT ARRAY['viewed','approved','revision'],
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

ALTER TABLE public.design_review_notifiees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifiees_staff_read"
ON public.design_review_notifiees FOR SELECT
USING (get_my_role() = ANY(ARRAY['owner','admin','developer']));

CREATE POLICY "notifiees_staff_write"
ON public.design_review_notifiees FOR ALL
USING (get_my_role() = ANY(ARRAY['owner','admin','developer']))
WITH CHECK (get_my_role() = ANY(ARRAY['owner','admin','developer']));
```

**Step 2: Ejecutar en Supabase SQL Editor**

Ir a Supabase Dashboard → SQL Editor → pegar y ejecutar.
Verificar: `SELECT * FROM patient_design_reviews LIMIT 1;` sin error.

**Step 3: Insertar notifiees manualmente**

En SQL Editor ejecutar (reemplazar con los UUIDs reales de profiles):
```sql
-- Buscar los profile IDs primero:
SELECT id, full_name, email FROM profiles
WHERE full_name ILIKE '%claudia%'
   OR full_name ILIKE '%lourdes%'
   OR full_name ILIKE '%julian%';

-- Luego insertar:
INSERT INTO design_review_notifiees (profile_id, notify_on)
VALUES
  ('[UUID_CLAUDIA]', ARRAY['viewed','approved','revision']),
  ('[UUID_LOURDES]', ARRAY['viewed','approved','revision']),
  ('[UUID_JULIAN]',  ARRAY['viewed','approved','revision'])
ON CONFLICT (profile_id) DO NOTHING;
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260307220000_design_review.sql
git commit -m "feat: add patient_design_reviews table and design_review_notifiees"
```

---

## Task 2: Google Drive — crear carpeta EXOCAD/HTML

**Files:**
- Modify: `lib/google-drive.ts` — agregar función `ensureExocadHtmlFolder`

**Step 1: Agregar la función al final de `lib/google-drive.ts`**

```typescript
/**
 * Ensures the [EXOCAD] and [EXOCAD]/HTML subfolders exist for a patient.
 * Returns the HTML subfolder ID where Julián uploads the design.
 */
export async function ensureExocadHtmlFolder(
    motherFolderId: string
): Promise<{ htmlFolderId?: string; exocadFolderId?: string; error?: string }> {
    try {
        const drive = getDrive();

        // 1. Get mother folder name to compose subfolder name
        const motherFile = await drive.files.get({
            fileId: motherFolderId,
            supportsAllDrives: true,
            fields: 'name',
        });
        const motherName = motherFile.data.name || 'PACIENTE';

        // 2. Ensure [EXOCAD] subfolder
        const exocadName = `[EXOCAD] ${motherName}`;
        const exocadResult = await createDriveFolder(drive, motherFolderId, exocadName);
        if (exocadResult.error || !exocadResult.folderId) {
            return { error: exocadResult.error || 'No se pudo crear carpeta EXOCAD' };
        }

        // 3. Ensure HTML subfolder inside [EXOCAD]
        const htmlResult = await createDriveFolder(drive, exocadResult.folderId, 'HTML');
        if (htmlResult.error || !htmlResult.folderId) {
            return { error: htmlResult.error || 'No se pudo crear carpeta HTML' };
        }

        return {
            exocadFolderId: exocadResult.folderId,
            htmlFolderId: htmlResult.folderId,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Finds the latest HTML file inside a Drive folder (most recently modified).
 * Returns its file ID and name, or null if none found.
 */
export async function getLatestHtmlFileInFolder(
    folderId: string
): Promise<{ fileId?: string; fileName?: string; error?: string }> {
    try {
        const drive = getDrive();
        const res = await drive.files.list({
            q: `'${folderId}' in parents and mimeType='text/html' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, modifiedTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 1,
        });

        const files = res.data.files || [];
        if (!files.length) return {};

        return {
            fileId: files[0].id!,
            fileName: files[0].name!,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Downloads the raw content of a Drive file by ID.
 * Used to proxy the HTML to the patient portal iframe.
 */
export async function getDriveFileContent(
    fileId: string
): Promise<{ content?: string; error?: string }> {
    try {
        const drive = getDrive();
        const res = await drive.files.get(
            { fileId, supportsAllDrives: true, alt: 'media' },
            { responseType: 'text' }
        );
        return { content: res.data as string };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
```

**Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores relacionados a `lib/google-drive.ts`.

**Step 3: Commit**

```bash
git add lib/google-drive.ts
git commit -m "feat: add ensureExocadHtmlFolder and Drive HTML helpers"
```

---

## Task 3: Server actions para design review

**Files:**
- Create: `app/actions/design-review.ts`

**Step 1: Crear el archivo**

```typescript
'use server';

import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/admin';
import {
    ensureExocadHtmlFolder,
    getLatestHtmlFileInFolder,
    extractFolderIdFromUrl,
} from '@/lib/google-drive';
import crypto from 'crypto';

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '';

/** Activa el flujo de diseño digital: crea carpeta EXOCAD/HTML en Drive y registra en DB */
export async function activateDesignFlow(
    patientId: string,
    motherFolderUrl: string
): Promise<{ success: boolean; reviewId?: string; htmlFolderId?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const motherFolderId = extractFolderIdFromUrl(motherFolderUrl);
    if (!motherFolderId) return { success: false, error: 'La ficha del paciente no tiene carpeta de Drive configurada' };

    // Crear carpeta en Drive
    const folderResult = await ensureExocadHtmlFolder(motherFolderId);
    if (folderResult.error || !folderResult.htmlFolderId) {
        return { success: false, error: folderResult.error };
    }

    const admin = getAdminClient();

    // Crear o actualizar registro de design review
    const { data, error } = await admin
        .from('patient_design_reviews')
        .upsert(
            {
                patient_id: patientId,
                exocad_folder_id: folderResult.htmlFolderId,
                label: `Diseño de Sonrisa`,
                status: 'pending',
                uploaded_by: user.id,
            },
            { onConflict: 'patient_id' }
        )
        .select('id')
        .single();

    if (error) return { success: false, error: error.message };

    return {
        success: true,
        reviewId: data.id,
        htmlFolderId: folderResult.htmlFolderId,
    };
}

/** Sincroniza el archivo HTML más reciente de la carpeta Drive con el registro en DB */
export async function syncDesignHtmlFile(
    reviewId: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    const { data: review, error: rErr } = await admin
        .from('patient_design_reviews')
        .select('exocad_folder_id')
        .eq('id', reviewId)
        .single();

    if (rErr || !review?.exocad_folder_id) return { success: false, error: 'Revisión no encontrada' };

    const fileResult = await getLatestHtmlFileInFolder(review.exocad_folder_id);
    if (fileResult.error) return { success: false, error: fileResult.error };
    if (!fileResult.fileId) return { success: false, error: 'No hay archivo HTML en la carpeta EXOCAD/HTML. Pedile a Julián que lo suba.' };

    const { error: uErr } = await admin
        .from('patient_design_reviews')
        .update({ drive_html_file_id: fileResult.fileId, status: 'pending' })
        .eq('id', reviewId);

    if (uErr) return { success: false, error: uErr.message };
    return { success: true, fileId: fileResult.fileId };
}

/** Genera token de portal apuntando a un design review específico */
export async function generateDesignReviewToken(
    patientId: string,
    reviewId: string
): Promise<{ success: boolean; url?: string; whatsappUrl?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    const { error } = await admin
        .from('patient_portal_tokens')
        .upsert(
            {
                patient_id: patientId,
                token,
                expires_at: expiresAt.toISOString(),
                used: false,
                review_id: reviewId,
            },
            { onConflict: 'patient_id' }
        );

    if (error) return { success: false, error: error.message };

    // Obtener nombre de la paciente para mensaje WA
    const { data: patient } = await admin
        .from('pacientes')
        .select('nombre, apellido')
        .eq('id_paciente', patientId)
        .single();

    const nombre = patient?.nombre || 'tu paciente';
    const portalUrl = `${APP_URL}/mi-clinica/${token}`;

    const waMessage = encodeURIComponent(
        `Hola ${nombre}! 🦷✨\n\nTu diseño de sonrisa ya está listo para que lo veas.\n\nEntrá desde este link y contanos qué te parece:\n${portalUrl}`
    );
    const whatsappUrl = `https://wa.me/?text=${waMessage}`;

    return { success: true, url: portalUrl, whatsappUrl };
}

/** Obtiene el design review activo de un paciente */
export async function getPatientDesignReview(
    patientId: string
): Promise<{
    review: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
        exocad_folder_id: string | null;
        patient_comment: string | null;
        viewed_at: string | null;
        responded_at: string | null;
        created_at: string;
    } | null;
    error?: string;
}> {
    const admin = getAdminClient();
    const { data, error } = await admin
        .from('patient_design_reviews')
        .select('id, status, label, drive_html_file_id, exocad_folder_id, patient_comment, viewed_at, responded_at, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return { review: null, error: error.message };
    return { review: data };
}
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/actions/design-review.ts
git commit -m "feat: server actions for design review (activate, sync, token generation)"
```

---

## Task 4: API Route — proxy HTML de Drive al iframe

**Files:**
- Create: `app/api/design-review/[patientId]/html/route.ts`

**Step 1: Crear la route**

```typescript
import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getDriveFileContent } from '@/lib/google-drive';

const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
    request: Request,
    { params }: { params: Promise<{ patientId: string }> }
) {
    const { patientId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return new NextResponse('Token requerido', { status: 401 });
    }

    // Validar token
    const { data: tokenData } = await admin
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, is_active')
        .eq('token', token)
        .eq('patient_id', patientId)
        .single();

    if (!tokenData || !tokenData.is_active || new Date(tokenData.expires_at) < new Date()) {
        return new NextResponse('Token inválido o expirado', { status: 401 });
    }

    // Obtener el file_id del HTML
    const { data: review } = await admin
        .from('patient_design_reviews')
        .select('drive_html_file_id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!review?.drive_html_file_id) {
        return new NextResponse('Diseño no disponible aún', { status: 404 });
    }

    // Proxy del HTML desde Drive
    const { content, error } = await getDriveFileContent(review.drive_html_file_id);

    if (error || !content) {
        return new NextResponse('Error al cargar el diseño', { status: 502 });
    }

    return new NextResponse(content, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'SAMEORIGIN',
            'Cache-Control': 'private, no-cache',
        },
    });
}
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/api/design-review/[patientId]/html/route.ts
git commit -m "feat: proxy API route to serve Exocad HTML from Drive to iframe"
```

---

## Task 5: API Route — respuesta de la paciente (viewed / approve / revision)

**Files:**
- Create: `app/api/design-review/[patientId]/respond/route.ts`

**Step 1: Crear la route**

```typescript
import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '';

type Action = 'viewed' | 'approved' | 'revision';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ patientId: string }> }
) {
    const { patientId } = await params;
    const body = await request.json().catch(() => ({}));
    const { token, action, comment } = body as { token: string; action: Action; comment?: string };

    if (!token || !action) {
        return NextResponse.json({ error: 'token y action requeridos' }, { status: 400 });
    }

    // Validar token
    const { data: tokenData } = await admin
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, is_active')
        .eq('token', token)
        .eq('patient_id', patientId)
        .single();

    if (!tokenData || !tokenData.is_active || new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Obtener review activo
    const { data: review } = await admin
        .from('patient_design_reviews')
        .select('id, status, label')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!review) {
        return NextResponse.json({ error: 'Revisión no encontrada' }, { status: 404 });
    }

    // Obtener datos de la paciente
    const { data: patient } = await admin
        .from('pacientes')
        .select('nombre, apellido')
        .eq('id_paciente', patientId)
        .single();

    const patientName = patient ? `${patient.nombre} ${patient.apellido}` : 'La paciente';

    // Actualizar estado
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};

    if (action === 'viewed' && !review.status.includes('viewed') && review.status === 'pending') {
        updates.status = 'viewed';
        updates.viewed_at = now;
    } else if (action === 'approved') {
        updates.status = 'approved';
        updates.responded_at = now;
        if (comment) updates.patient_comment = comment;
    } else if (action === 'revision') {
        updates.status = 'revision';
        updates.responded_at = now;
        if (comment) updates.patient_comment = comment;
    }

    if (Object.keys(updates).length > 0) {
        await admin
            .from('patient_design_reviews')
            .update(updates)
            .eq('id', review.id);
    }

    // Notificar si es viewed, approved o revision (no re-notificar viewed si ya estaba)
    if (action !== 'viewed' || review.status === 'pending') {
        await sendNotifications(patientId, patientName, action, comment, review.label);
    }

    return NextResponse.json({ success: true });
}

async function sendNotifications(
    patientId: string,
    patientName: string,
    action: Action,
    comment: string | undefined,
    designLabel: string
) {
    // Obtener notifiees activos
    const { data: notifiees } = await admin
        .from('design_review_notifiees')
        .select('profile_id, notify_on')
        .eq('is_active', true)
        .contains('notify_on', [action]);

    if (!notifiees?.length) return;

    const profileIds = notifiees.map(n => n.profile_id);
    const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', profileIds);

    if (!profiles?.length) return;

    const actionLabels: Record<Action, string> = {
        viewed: 'vio su diseño por primera vez',
        approved: 'APROBÓ el diseño ✅',
        revision: 'pidió cambios en el diseño ✏️',
    };

    const subject = `${patientName} ${actionLabels[action]}`;
    const fichaUrl = `${APP_URL}/patients/${patientId}`;

    const bodyHtml = `
        <div style="font-family:sans-serif;padding:24px;background:#0a0a0f;color:#fff;border-radius:8px">
          <h2 style="color:#C9A96E;margin:0 0 12px">${subject}</h2>
          <p style="color:rgba(255,255,255,0.7);margin:0 0 8px"><strong>Diseño:</strong> ${designLabel}</p>
          ${comment ? `<p style="color:rgba(255,255,255,0.7);margin:0 0 16px"><strong>Comentario:</strong> "${comment}"</p>` : ''}
          <a href="${fichaUrl}" style="display:inline-block;padding:10px 20px;background:#C9A96E;color:#000;border-radius:6px;text-decoration:none;font-weight:bold">
            Ver ficha del paciente →
          </a>
        </div>
    `;

    for (const profile of profiles) {
        if (!profile.email) continue;
        try {
            await resend.emails.send({
                from: 'AM Clínica <notificaciones@am-clinica.ar>',
                to: profile.email,
                subject,
                html: bodyHtml,
            });
        } catch (err) {
            console.error('[design-review] Error enviando email a', profile.email, err);
        }
    }

    // In-app: insertar en tabla de notificaciones (si existe) o log
    // TODO: cuando se implemente sistema de notificaciones in-app centralizado
    console.log(`[design-review] Notificaciones enviadas para acción "${action}" en paciente ${patientId}`);
}
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/api/design-review/[patientId]/respond/route.ts
git commit -m "feat: respond API route for patient design review (viewed/approved/revision + email notifications)"
```

---

## Task 6: Componente interno — DesignReviewTab (ficha del paciente)

**Files:**
- Create: `components/patients/DesignReviewTab.tsx`

**Step 1: Crear el componente**

```typescript
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Box, FolderOpen, RefreshCw, Send, Eye, CheckCircle2, Clock, AlertCircle, ExternalLink, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
    activateDesignFlow,
    syncDesignHtmlFile,
    generateDesignReviewToken,
    getPatientDesignReview,
} from '@/app/actions/design-review';

interface DesignReviewTabProps {
    patientId: string;
    motherFolderUrl: string | null;
    initialReview: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
        exocad_folder_id: string | null;
        patient_comment: string | null;
        viewed_at: string | null;
        responded_at: string | null;
        created_at: string;
    } | null;
}

const STATUS_CONFIG = {
    pending: { label: 'Pendiente', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', icon: Clock },
    viewed: { label: 'Vista por la paciente', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: Eye },
    approved: { label: 'Aprobado ✅', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
    revision: { label: 'Pide cambios ✏️', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertCircle },
};

export default function DesignReviewTab({ patientId, motherFolderUrl, initialReview }: DesignReviewTabProps) {
    const [review, setReview] = useState(initialReview);
    const [loading, setLoading] = useState<string | null>(null);

    async function handleActivate() {
        if (!motherFolderUrl) {
            toast.error('El paciente no tiene carpeta de Drive configurada');
            return;
        }
        setLoading('activate');
        const result = await activateDesignFlow(patientId, motherFolderUrl);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('Flujo de diseño activado. Carpeta EXOCAD/HTML creada en Drive.');
            // Reload review
            const { review: r } = await getPatientDesignReview(patientId);
            setReview(r);
        }
        setLoading(null);
    }

    async function handleSync() {
        if (!review) return;
        setLoading('sync');
        const result = await syncDesignHtmlFile(review.id);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('Diseño sincronizado desde Drive');
            const { review: r } = await getPatientDesignReview(patientId);
            setReview(r);
        }
        setLoading(null);
    }

    async function handleSendLink() {
        if (!review) return;
        setLoading('send');
        const result = await generateDesignReviewToken(patientId, review.id);
        if (result.error) {
            toast.error(result.error);
        } else {
            // Abrir WhatsApp directamente
            window.open(result.whatsappUrl, '_blank');
            toast.success('Link generado y abierto en WhatsApp');
        }
        setLoading(null);
    }

    const status = review?.status as keyof typeof STATUS_CONFIG | undefined;
    const StatusIcon = status ? STATUS_CONFIG[status].icon : Clock;

    if (!review) {
        return (
            <div className="space-y-6">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="h-16 w-16 rounded-2xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 flex items-center justify-center">
                            <Box size={28} className="text-[#C9A96E]" />
                        </div>
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">Flujo de Diseño Digital</h3>
                    <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto">
                        Al activarlo se crea la carpeta <code className="text-[#C9A96E]">[EXOCAD]/HTML/</code> en Drive para que Julián suba el diseño.
                    </p>
                    <button
                        onClick={handleActivate}
                        disabled={loading === 'activate'}
                        className="px-6 py-3 rounded-xl bg-[#C9A96E] text-black font-bold text-sm hover:bg-[#C9A96E]/90 transition-colors disabled:opacity-50"
                    >
                        {loading === 'activate' ? 'Activando...' : '✨ Activar flujo de diseño digital'}
                    </button>
                    {!motherFolderUrl && (
                        <p className="text-red-400 text-xs mt-3">⚠️ El paciente no tiene carpeta de Drive configurada</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Status card */}
            <div className={`rounded-2xl border p-5 ${status ? STATUS_CONFIG[status].bg : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <StatusIcon size={18} className={status ? STATUS_CONFIG[status].color : 'text-slate-400'} />
                        <div>
                            <p className={`font-semibold text-sm ${status ? STATUS_CONFIG[status].color : 'text-slate-400'}`}>
                                {status ? STATUS_CONFIG[status].label : '—'}
                            </p>
                            <p className="text-white/40 text-xs mt-0.5">{review.label}</p>
                        </div>
                    </div>
                    {review.drive_html_file_id && (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                            HTML listo
                        </span>
                    )}
                </div>

                {review.patient_comment && (
                    <div className="mt-4 p-3 rounded-xl bg-black/20 border border-white/5">
                        <p className="text-white/50 text-xs mb-1">Comentario de la paciente:</p>
                        <p className="text-white text-sm italic">"{review.patient_comment}"</p>
                    </div>
                )}

                {review.viewed_at && (
                    <p className="text-white/30 text-xs mt-3">
                        👁 Vista: {new Date(review.viewed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            {/* Acciones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    onClick={handleSync}
                    disabled={!!loading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={15} className={loading === 'sync' ? 'animate-spin' : ''} />
                    {loading === 'sync' ? 'Sincronizando...' : 'Sincronizar desde Drive'}
                </button>

                <button
                    onClick={handleSendLink}
                    disabled={!!loading || !review.drive_html_file_id}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors disabled:opacity-40"
                >
                    <Smartphone size={15} />
                    {loading === 'send' ? 'Generando...' : 'Enviar por WhatsApp'}
                </button>
            </div>

            {!review.drive_html_file_id && (
                <p className="text-amber-400/70 text-xs text-center">
                    ⚠️ Todavía no hay archivo HTML. Pedile a Julián que suba el diseño a la carpeta Drive y luego sincronizá.
                </p>
            )}

            {/* Link carpeta Drive */}
            {review.exocad_folder_id && (
                <a
                    href={`https://drive.google.com/drive/folders/${review.exocad_folder_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-white/40 text-xs hover:text-white/60 transition-colors"
                >
                    <FolderOpen size={13} />
                    Abrir carpeta EXOCAD/HTML en Drive
                    <ExternalLink size={11} />
                </a>
            )}
        </div>
    );
}
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add components/patients/DesignReviewTab.tsx
git commit -m "feat: DesignReviewTab component for internal patient ficha"
```

---

## Task 7: Conectar DesignReviewTab a la ficha del paciente

**Files:**
- Modify: `app/patients/[id]/page.tsx`

**Step 1: Leer el archivo y encontrar dónde agregar la tab**

Leer `app/patients/[id]/page.tsx`. Buscar dónde se renderizan las tabs (PatientDashboard o tabs inline). Agregar la carga del design review y pasarlo como prop.

Agregar al `import`:
```typescript
import DesignReviewTab from '@/components/patients/DesignReviewTab';
import { getPatientDesignReview } from '@/app/actions/design-review';
```

Agregar al `Promise.all` de fetches:
```typescript
const { review: designReview } = await getPatientDesignReview(patient.id_paciente);
```

Agregar la tab en el panel de tabs (buscar el patrón de tabs existente y agregar):
```typescript
{activeTab === 'diseno' && (
    <DesignReviewTab
        patientId={patient.id_paciente}
        motherFolderUrl={patient.link_historia_clinica || null}
        initialReview={designReview}
    />
)}
```

Y en los botones de tab:
```typescript
<button onClick={() => setActiveTab('diseno')} className={...}>
    🦷 Diseño Digital
</button>
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/patients/[id]/page.tsx
git commit -m "feat: add Diseño Digital tab to patient ficha"
```

---

## Task 8: Componente portal paciente — DesignReviewSection

**Files:**
- Create: `components/portal-paciente/DesignReviewSection.tsx`

**Step 1: Crear el componente**

```typescript
'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, RefreshCw, ChevronDown } from 'lucide-react';

interface DesignReviewSectionProps {
    patientId: string;
    token: string;
    label: string;
    hasHtml: boolean;
}

type Step = 'view' | 'respond' | 'confirmed';
type Action = 'approved' | 'revision';

export default function DesignReviewSection({ patientId, token, label, hasHtml }: DesignReviewSectionProps) {
    const [step, setStep] = useState<Step>('view');
    const [action, setAction] = useState<Action | null>(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Marcar como vista al cargar
    const [markedViewed, setMarkedViewed] = useState(false);
    function handleIframeLoad() {
        setIframeLoaded(true);
        if (!markedViewed) {
            setMarkedViewed(true);
            fetch(`/api/design-review/${patientId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action: 'viewed' }),
            }).catch(() => {});
        }
    }

    async function handleRespond() {
        if (!action) return;
        setLoading(true);
        try {
            await fetch(`/api/design-review/${patientId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, action, comment: comment.trim() || undefined }),
            });
            setStep('confirmed');
        } catch {
            // silenciar error — no bloquear al paciente
            setStep('confirmed');
        }
        setLoading(false);
    }

    const htmlSrc = `/api/design-review/${patientId}/html?token=${token}`;

    return (
        <section className="rounded-3xl bg-[#14141A] border border-white/5 overflow-hidden">
            {/* Header */}
            <div className="p-6 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={16} className="text-[#C9A96E]" />
                    <h2 className="text-white font-bold text-lg">Tu Diseño de Sonrisa</h2>
                </div>
                <p className="text-white/40 text-sm">
                    {label} · Mirá el diseño en 3D y contanos qué pensás.
                </p>
            </div>

            {/* Iframe */}
            {hasHtml ? (
                <div className="relative">
                    {!iframeLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#0D0D12] z-10 min-h-[50vh]">
                            <div className="text-center">
                                <RefreshCw size={28} className="text-[#C9A96E] animate-spin mx-auto mb-3" />
                                <p className="text-white/40 text-sm">Cargando tu diseño...</p>
                            </div>
                        </div>
                    )}
                    <div className={`relative ${fullscreen ? 'fixed inset-0 z-50 bg-black' : 'min-h-[70vh]'}`}>
                        <iframe
                            ref={iframeRef}
                            src={htmlSrc}
                            onLoad={handleIframeLoad}
                            className="w-full h-full min-h-[70vh] border-0"
                            sandbox="allow-scripts allow-same-origin"
                            title="Diseño de Sonrisa"
                        />
                        <button
                            onClick={() => setFullscreen(f => !f)}
                            className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white/60 text-xs border border-white/10 hover:bg-black/80 transition-colors"
                        >
                            {fullscreen ? '⊠ Cerrar' : '⊞ Pantalla completa'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mx-6 mb-4 p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <p className="text-white/40 text-sm">El diseño se está preparando. Te avisamos cuando esté listo.</p>
                </div>
            )}

            {/* Respuesta */}
            <div className="p-6 pt-4">
                <AnimatePresence mode="wait">
                    {step === 'view' && (
                        <motion.div
                            key="view"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="space-y-3"
                        >
                            <p className="text-white/60 text-sm font-medium">¿Qué te parece el diseño?</p>
                            <textarea
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Escribí tu opinión (opcional)..."
                                rows={3}
                                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm px-4 py-3 focus:outline-none focus:border-[#C9A96E]/40 resize-none"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={() => { setAction('approved'); setStep('respond'); }}
                                    className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-sm hover:bg-emerald-500/20 transition-colors active:scale-95"
                                >
                                    <CheckCircle2 size={18} />
                                    Me encanta, apruebo el diseño
                                </button>
                                <button
                                    onClick={() => { setAction('revision'); setStep('respond'); }}
                                    className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold text-sm hover:bg-amber-500/20 transition-colors active:scale-95"
                                >
                                    ✏️ Quiero hacer cambios
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'respond' && (
                        <motion.div
                            key="respond"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="space-y-4"
                        >
                            <div className={`p-4 rounded-2xl border text-sm font-medium ${
                                action === 'approved'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>
                                {action === 'approved'
                                    ? '✅ Vas a aprobar este diseño de sonrisa'
                                    : '✏️ Vas a pedir cambios en el diseño'}
                            </div>
                            <p className="text-white/40 text-xs text-center">¿Estás segura?</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('view')}
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-colors"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleRespond}
                                    disabled={loading}
                                    className="flex-2 flex-grow px-4 py-3 rounded-xl bg-[#C9A96E] text-black font-bold text-sm hover:bg-[#C9A96E]/90 transition-colors disabled:opacity-50"
                                >
                                    {loading ? 'Enviando...' : 'Confirmar'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'confirmed' && (
                        <motion.div
                            key="confirmed"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-6"
                        >
                            <div className="text-4xl mb-3">🦷✨</div>
                            <p className="text-white font-bold text-lg mb-1">
                                {action === 'approved' ? '¡Diseño aprobado!' : '¡Mensaje enviado!'}
                            </p>
                            <p className="text-white/40 text-sm">
                                {action === 'approved'
                                    ? 'Le avisamos al equipo. Pronto nos ponemos en contacto.'
                                    : 'Recibimos tu feedback. Julián va a trabajar en los cambios.'}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
}
```

**Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add components/portal-paciente/DesignReviewSection.tsx
git commit -m "feat: DesignReviewSection component for patient portal"
```

---

## Task 9: Conectar todo al portal de la paciente

**Files:**
- Modify: `app/mi-clinica/[token]/page.tsx`

**Step 1: Agregar import dinámico de DesignReviewSection**

```typescript
const DesignReviewSection = dynamic(() => import('@/components/portal-paciente/DesignReviewSection'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-48 rounded-2xl bg-white/5 border border-white/10">
            <Loader2 size={28} className="text-[#C9A96E] animate-spin" />
        </div>
    ),
});
```

**Step 2: Cargar design review desde la API de portal**

En `app/api/portal/[token]/route.ts` agregar al `Promise.all`:
```typescript
supabase
    .from('patient_design_reviews')
    .select('id, status, label, drive_html_file_id, patient_comment, viewed_at, responded_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
```
Y agregarlo al response JSON como `designReview`.

**Step 3: Renderizar en page.tsx**

En `app/mi-clinica/[token]/page.tsx`, después de la sección STL existente, agregar:
```typescript
{data.designReview && data.designReview.drive_html_file_id && (
    <DesignReviewSection
        patientId={patient.id_paciente}
        token={token}
        label={data.designReview.label}
        hasHtml={!!data.designReview.drive_html_file_id}
    />
)}
```

**Step 4: Verificar compilación y build**

```bash
npx tsc --noEmit && npm run build
```

**Step 5: Commit**

```bash
git add app/mi-clinica/[token]/page.tsx app/api/portal/[token]/route.ts
git commit -m "feat: connect DesignReviewSection to patient portal mi-clinica/[token]"
```

---

## Task 10: Push final y verificación en Vercel

**Step 1: Push a main**

```bash
git push origin main
```

**Step 2: Verificar build en Vercel**

Esperar que Vercel complete el build exitosamente.

**Step 3: Test end-to-end manual**

1. Ir a `/patients/[id]` de Carolina Hahn → tab "Diseño Digital"
2. Click "Activar flujo de diseño digital" → verificar carpeta creada en Drive
3. Subir el HTML de Exocad a la carpeta → click "Sincronizar desde Drive"
4. Click "Enviar por WhatsApp" → verificar que se abre WA con el link
5. Abrir el link como paciente → verificar iframe cargando el HTML
6. Aprobar → verificar emails a Claudia, Lourdes, Julián
7. Verificar que en la ficha interna aparece el estado "Aprobado"

**Step 4: Commit de ajustes si hay**

```bash
git add -A && git commit -m "fix: post-QA adjustments to design review flow"
git push origin main
```

---

## Fuera del MVP (segunda etapa)

- Objetivos clínicos del tratamiento (cargados al activar el flujo)
- Comparador antes/después (STL original vs diseño)
- Notificaciones in-app con bell icon centralizado
- Múltiples revisiones con historial de versiones
