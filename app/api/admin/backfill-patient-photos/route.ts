import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { extractFolderIdFromUrl } from '@/lib/google-drive';
import { getPatientAllFilesAction } from '@/app/actions/patient-files-drive';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();

        // Verify admin role
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }
        const { data: profile } = await supabase
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .single();
        if (!profile || !['owner', 'admin'].includes(profile.categoria)) {
            return NextResponse.json({ error: 'Se requiere rol admin' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const limit = Math.min(Number(body.limit) || 100, 200);

        // Patients with a Drive folder but no profile photo set
        const { data: patients, error } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, link_historia_clinica')
            .eq('is_deleted', false)
            .not('link_historia_clinica', 'is', null)
            .neq('link_historia_clinica', '')
            .is('foto_perfil_url', null)
            .limit(limit);

        if (error) throw error;
        if (!patients?.length) {
            return NextResponse.json({ updated: 0, remaining: 0, message: 'Todos los pacientes ya tienen foto de perfil seteada.' });
        }

        let updated = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const patient of patients) {
            try {
                const folderId = extractFolderIdFromUrl(patient.link_historia_clinica);
                if (!folderId) { skipped++; continue; }

                const { files } = await getPatientAllFilesAction(folderId);

                const firstImage = files.find(f =>
                    typeof f.mimeType === 'string' && f.mimeType.startsWith('image/')
                );

                if (!firstImage?.id) { skipped++; continue; }

                const { error: updateError } = await supabase
                    .from('pacientes')
                    .update({ foto_perfil_url: firstImage.id })
                    .eq('id_paciente', patient.id_paciente);

                if (updateError) {
                    errors.push(`${patient.apellido} ${patient.nombre}: ${updateError.message}`);
                } else {
                    updated++;
                }
            } catch (err) {
                errors.push(`${patient.apellido} ${patient.nombre}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // Count remaining
        const { count: remaining } = await supabase
            .from('pacientes')
            .select('id_paciente', { count: 'exact', head: true })
            .eq('is_deleted', false)
            .not('link_historia_clinica', 'is', null)
            .neq('link_historia_clinica', '')
            .is('foto_perfil_url', null);

        return NextResponse.json({
            processed: patients.length,
            updated,
            skipped,
            errors: errors.slice(0, 20),
            remaining: remaining || 0,
        });
    } catch (error) {
        console.error('[backfill-patient-photos]', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
