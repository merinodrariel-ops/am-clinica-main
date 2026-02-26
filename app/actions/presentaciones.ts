'use server';

import { createClient } from '@supabase/supabase-js';
import {
    ensurePatientPresentationFolder,
    extractFolderIdFromUrl,
    listFolderFiles,
} from '@/lib/google-drive';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface SyncedPresentation {
    drive_file_id: string;
    drive_name: string;
    drive_web_view_link: string;
    drive_mime_type: string;
    drive_created_time: string | null;
    sync_status: 'synced' | 'manual_review';
    sync_error: string | null;
    last_synced_at: string;
}

export interface SyncPresentacionesResult {
    success: boolean;
    syncedCount: number;
    manualReview: Array<{ reason: string; fileName?: string; fileId?: string }>;
    folderUrl?: string;
    error?: string;
}

export interface SyncAllPresentacionesResult {
    success: boolean;
    processedPatients: number;
    syncedFiles: number;
    manualReviewCount: number;
    manualReview: Array<{
        patientId: string;
        patientName: string;
        reason: string;
        fileName?: string;
        fileId?: string;
    }>;
    error?: string;
}

interface PatientBase {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    link_historia_clinica: string | null;
}

async function syncPatientPresentationsForPatient(patient: PatientBase): Promise<SyncPresentacionesResult> {
    const patientId = patient.id_paciente;
    const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica);
    const folderSetup = await ensurePatientPresentationFolder(
        patient.apellido || '',
        patient.nombre || '',
        motherFolderId || undefined
    );

    if (folderSetup.error || !folderSetup.presentationFolderId || !folderSetup.motherFolderId) {
        return {
            success: false,
            syncedCount: 0,
            manualReview: [{ reason: folderSetup.error || 'No se pudo preparar carpeta de presentaciones' }],
            error: folderSetup.error || 'No se pudo preparar carpeta de presentaciones',
        };
    }

    if (folderSetup.motherFolderUrl && patient.link_historia_clinica !== folderSetup.motherFolderUrl) {
        await supabase
            .from('pacientes')
            .update({ link_historia_clinica: folderSetup.motherFolderUrl })
            .eq('id_paciente', patientId);
    }

    const filesResult = await listFolderFiles(folderSetup.presentationFolderId);
    if (filesResult.error) {
        return {
            success: false,
            syncedCount: 0,
            manualReview: [{ reason: filesResult.error }],
            folderUrl: folderSetup.presentationFolderUrl,
            error: filesResult.error,
        };
    }

    const files = (filesResult.files || []).filter(
        (file) => file.mimeType !== 'application/vnd.google-apps.folder'
    );

    const manualReview: Array<{ reason: string; fileName?: string; fileId?: string }> = [];
    let syncedCount = 0;

    const fileIdsInFolder = new Set<string>();

    for (const file of files) {
        if (!file.id || !file.name || !file.webViewLink) {
            manualReview.push({
                reason: 'Archivo sin metadatos completos (falta id/nombre/link)',
                fileName: file.name,
                fileId: file.id,
            });
            continue;
        }

        fileIdsInFolder.add(file.id);

        const { error: upsertError } = await supabase
            .from('paciente_presentaciones')
            .upsert(
                {
                    paciente_id: patientId,
                    drive_file_id: file.id,
                    drive_name: file.name,
                    drive_web_view_link: file.webViewLink,
                    drive_mime_type: file.mimeType,
                    drive_created_time: file.createdTime || null,
                    drive_folder_id: folderSetup.presentationFolderId,
                    is_deleted: false,
                    sync_status: 'synced',
                    sync_error: null,
                    last_synced_at: new Date().toISOString(),
                },
                { onConflict: 'paciente_id,drive_file_id' }
            );

        if (upsertError) {
            manualReview.push({
                reason: `No se pudo guardar en base: ${upsertError.message}`,
                fileName: file.name,
                fileId: file.id,
            });
            continue;
        }

        syncedCount += 1;
    }

    const { data: existingRows } = await supabase
        .from('paciente_presentaciones')
        .select('drive_file_id')
        .eq('paciente_id', patientId)
        .eq('drive_folder_id', folderSetup.presentationFolderId)
        .eq('is_deleted', false);

    const existingIds = (existingRows || []).map((row) => row.drive_file_id).filter(Boolean) as string[];
    const toMarkDeleted = existingIds.filter((id) => !fileIdsInFolder.has(id));

    if (toMarkDeleted.length > 0) {
        await supabase
            .from('paciente_presentaciones')
            .update({ is_deleted: true, last_synced_at: new Date().toISOString() })
            .eq('paciente_id', patientId)
            .in('drive_file_id', toMarkDeleted);
    }

    return {
        success: true,
        syncedCount,
        manualReview,
        folderUrl: folderSetup.presentationFolderUrl,
    };
}

export async function getPatientPresentationsAction(
    patientId: string
): Promise<{ success: boolean; data?: SyncedPresentation[]; error?: string }> {
    try {
        if (!patientId) return { success: false, error: 'patientId requerido' };

        const { data, error } = await supabase
            .from('paciente_presentaciones')
            .select('drive_file_id, drive_name, drive_web_view_link, drive_mime_type, drive_created_time, sync_status, sync_error, last_synced_at')
            .eq('paciente_id', patientId)
            .eq('is_deleted', false)
            .order('drive_created_time', { ascending: false, nullsFirst: false });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, data: (data || []) as SyncedPresentation[] };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function syncPatientPresentationsAction(patientId: string): Promise<SyncPresentacionesResult> {
    try {
        if (!patientId) {
            return {
                success: false,
                syncedCount: 0,
                manualReview: [{ reason: 'Falta seleccionar paciente' }],
            };
        }

        const { data: patient, error: patientError } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, link_historia_clinica')
            .eq('id_paciente', patientId)
            .single();

        if (patientError || !patient) {
            return {
                success: false,
                syncedCount: 0,
                manualReview: [{ reason: 'Paciente no encontrado' }],
                error: patientError?.message || 'Paciente no encontrado',
            };
        }

        return await syncPatientPresentationsForPatient(patient as PatientBase);
    } catch (error) {
        return {
            success: false,
            syncedCount: 0,
            manualReview: [{ reason: error instanceof Error ? error.message : String(error) }],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function syncAllPatientPresentationsAction(maxPatients: number = 100): Promise<SyncAllPresentacionesResult> {
    try {
        const capped = Math.min(300, Math.max(1, Math.floor(maxPatients || 100)));
        const { data: patients, error } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, link_historia_clinica')
            .eq('is_deleted', false)
            .order('apellido', { ascending: true })
            .limit(capped);

        if (error) {
            return {
                success: false,
                processedPatients: 0,
                syncedFiles: 0,
                manualReviewCount: 0,
                manualReview: [],
                error: error.message,
            };
        }

        const safePatients = (patients || []) as PatientBase[];
        let syncedFiles = 0;
        const manualReview: SyncAllPresentacionesResult['manualReview'] = [];

        for (const patient of safePatients) {
            const result = await syncPatientPresentationsForPatient(patient);
            syncedFiles += result.syncedCount;

            if (!result.success || result.manualReview.length > 0) {
                const patientName = `${patient.apellido || ''}, ${patient.nombre || ''}`.trim() || patient.id_paciente;
                for (const item of result.manualReview) {
                    manualReview.push({
                        patientId: patient.id_paciente,
                        patientName,
                        reason: item.reason,
                        fileName: item.fileName,
                        fileId: item.fileId,
                    });
                }
            }
        }

        return {
            success: true,
            processedPatients: safePatients.length,
            syncedFiles,
            manualReviewCount: manualReview.length,
            manualReview,
        };
    } catch (error) {
        return {
            success: false,
            processedPatients: 0,
            syncedFiles: 0,
            manualReviewCount: 0,
            manualReview: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
