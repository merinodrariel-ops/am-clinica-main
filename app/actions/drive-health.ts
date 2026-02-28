'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { runDriveHealthCheck, type DriveHealthCheckResult } from '@/lib/drive-health';
import { sendEmail } from '@/lib/nodemailer';

interface RunDriveHealthInput {
    sampleLimit?: number;
    persist?: boolean;
    source?: string;
}

type DriveHealthPatientRow = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    link_historia_clinica: string | null;
};

export interface StoredDriveHealthRow {
    id: number;
    created_at: string;
    source: string;
    summary: DriveHealthCheckResult['summary'];
    samples: DriveHealthCheckResult['samples'];
}

function shouldAlert(summary: DriveHealthCheckResult['summary']): boolean {
    return summary.safeCandidateExtraFolders > 20 || summary.linkedFoldersOutsideRoot > 0;
}

async function persistHealthCheck(
    source: string,
    result: DriveHealthCheckResult
): Promise<void> {
    const supabase = createAdminClient();
    const { error } = await supabase.from('drive_health_checks').insert({
        source,
        summary: result.summary,
        samples: result.samples,
    });

    if (error) {
        console.error('drive health persist error:', error.message);
    }
}

async function sendHealthAlert(source: string, result: DriveHealthCheckResult): Promise<void> {
    const to = process.env.DRIVE_HEALTH_ALERT_EMAIL;
    if (!to) return;
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

    const { summary } = result;
    if (!shouldAlert(summary)) return;

    const html = `
        <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2 style="margin: 0 0 12px;">Drive Health Alert</h2>
            <p style="margin: 0 0 10px;">Se detectaron condiciones a revisar en el chequeo de Drive.</p>
            <ul style="margin: 0 0 12px; padding-left: 18px;">
                <li><strong>Origen:</strong> ${source}</li>
                <li><strong>Generado:</strong> ${result.generatedAt}</li>
                <li><strong>Grupos duplicados:</strong> ${summary.duplicateGroups}</li>
                <li><strong>Extras candidatos:</strong> ${summary.safeCandidateExtraFolders}</li>
                <li><strong>Links fuera de root:</strong> ${summary.linkedFoldersOutsideRoot}</li>
            </ul>
            <p style="margin: 0; color: #6b7280;">Revisar módulo Presentaciones Sync para detalles.</p>
        </div>
    `;

    await sendEmail({
        to,
        subject: '[AM Clinica] Drive health alert',
        html,
    });
}

export async function runDriveHealthCheckAction(
    input: RunDriveHealthInput = {}
): Promise<{ success: true; data: DriveHealthCheckResult } | { success: false; error: string }> {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, link_historia_clinica')
            .eq('is_deleted', false);

        if (error) {
            return { success: false, error: error.message };
        }

        const result = await runDriveHealthCheck((data || []) as DriveHealthPatientRow[], {
            sampleLimit: input.sampleLimit,
        });

        const source = input.source || 'manual-ui';
        const persist = input.persist ?? true;
        if (persist) {
            await persistHealthCheck(source, result);
        }

        await sendHealthAlert(source, result);

        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function getLatestDriveHealthChecksAction(
    limit = 5
): Promise<{ success: true; data: StoredDriveHealthRow[] } | { success: false; error: string }> {
    try {
        const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('drive_health_checks')
            .select('id, created_at, source, summary, samples')
            .order('created_at', { ascending: false })
            .limit(safeLimit);

        if (error) {
            if (error.message?.toLowerCase().includes('does not exist')) {
                return { success: true, data: [] };
            }
            return { success: false, error: error.message };
        }

        return { success: true, data: (data || []) as StoredDriveHealthRow[] };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
