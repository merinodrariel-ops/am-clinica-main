import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createAdminClient } from '@/utils/supabase/admin';
import { extractFolderIdFromUrl, getPatientFolderName } from '@/lib/google-drive';

type SanitizerPayload = {
    dryRun?: boolean;
    daysBack?: number;
    limit?: number;
    fullScan?: boolean;
};

type PatientRow = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    fecha_alta: string | null;
    link_historia_clinica: string | null;
};

const PRESENTATION_MIME_TYPES = new Set([
    'application/vnd.google-apps.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
]);

const SAMPLE_LIMIT = 30;

function authorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    const header = req.headers.get('Authorization') ?? req.headers.get('x-cron-secret');
    return header === `Bearer ${secret}` || header === secret;
}

function normalizeDaysBack(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(120, Math.max(1, Math.floor(parsed)));
}

function normalizeLimit(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 150;
    return Math.min(500, Math.max(10, Math.floor(parsed)));
}

function getAuth() {
    return new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
}

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as SanitizerPayload;
    const dryRun = Boolean(payload?.dryRun);
    const fullScan = Boolean(payload?.fullScan);
    const daysBack = normalizeDaysBack(payload?.daysBack);
    const limit = normalizeLimit(payload?.limit);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const supabase = createAdminClient();
    const drive = google.drive({ version: 'v3', auth: getAuth() });

    let query = supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, fecha_alta, link_historia_clinica')
        .eq('is_deleted', false)
        .not('link_historia_clinica', 'is', null)
        .order('fecha_alta', { ascending: false })
        .limit(limit);

    if (!fullScan) {
        query = query.gte('fecha_alta', sinceDate.toISOString());
    }

    const { data: patients, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (patients || []) as PatientRow[];

    let scanned = 0;
    let createdPresentationFolders = 0;
    let movedPresentations = 0;
    let patientsWithActions = 0;
    let skippedInvalidMotherLink = 0;
    const errors: string[] = [];
    const samples: string[] = [];

    for (const patient of rows) {
        scanned += 1;
        const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica);
        const patientLabel = `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim() || patient.id_paciente;

        if (!motherFolderId) {
            skippedInvalidMotherLink += 1;
            continue;
        }

        try {
            const children = await drive.files.list({
                q: `'${motherFolderId}' in parents and trashed=false`,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                fields: 'files(id, name, mimeType, parents)',
                pageSize: 200,
            });

            const files = children.data.files || [];
            const existingPresentationFolder = files.find(
                (f) => f.mimeType === 'application/vnd.google-apps.folder' && (f.name || '').toUpperCase().includes('PRESENTACION')
            );

            let presentationFolderId = existingPresentationFolder?.id;
            let touchedPatient = false;

            if (!presentationFolderId) {
                const presentationFolderName = `${getPatientFolderName(patient.apellido || '', patient.nombre || '')} - PRESENTACION`;
                if (!dryRun) {
                    const created = await drive.files.create({
                        supportsAllDrives: true,
                        requestBody: {
                            name: presentationFolderName,
                            mimeType: 'application/vnd.google-apps.folder',
                            parents: [motherFolderId],
                        },
                        fields: 'id',
                    });
                    presentationFolderId = created.data.id || undefined;
                } else {
                    presentationFolderId = `DRY:${patient.id_paciente}`;
                }

                createdPresentationFolders += 1;
                touchedPatient = true;
                if (samples.length < SAMPLE_LIMIT) {
                    samples.push(`${dryRun ? '[DRY]' : '[CREATE]'} ${patientLabel} -> ${presentationFolderName}`);
                }
            }

            const misplacedPresentations = files.filter(
                (f) => f.id && PRESENTATION_MIME_TYPES.has(f.mimeType || '')
            );

            for (const file of misplacedPresentations) {
                if (!presentationFolderId) continue;
                const currentParents = (file.parents || []).join(',');

                if (!dryRun) {
                    await drive.files.update({
                        fileId: file.id!,
                        supportsAllDrives: true,
                        enforceSingleParent: true,
                        addParents: presentationFolderId,
                        removeParents: currentParents,
                        fields: 'id',
                    });
                }

                movedPresentations += 1;
                touchedPatient = true;
                if (samples.length < SAMPLE_LIMIT) {
                    samples.push(`${dryRun ? '[DRY]' : '[MOVE]'} ${patientLabel} | ${file.name || file.id}`);
                }
            }

            if (touchedPatient) {
                patientsWithActions += 1;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${patientLabel}: ${message}`);
        }
    }

    return NextResponse.json({
        ok: true,
        at: new Date().toISOString(),
        mode: dryRun ? 'dry-run' : 'execute',
        scope: {
            fullScan,
            daysBack: fullScan ? null : daysBack,
            limit,
            since: fullScan ? null : sinceDate.toISOString(),
        },
        summary: {
            scanned,
            patientsWithActions,
            createdPresentationFolders,
            movedPresentations,
            skippedInvalidMotherLink,
            errors: errors.length,
        },
        samples,
        errors: errors.slice(0, 50),
    });
}

export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'GET not allowed in production' }, { status: 405 });
    }
    return POST(request);
}
