import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client (bypasses RLS — solo para este endpoint seguro)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    if (!token) {
        return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    // 1. Validar token
    const { data: tokenData, error: tokenError } = await supabase
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, is_active')
        .eq('token', token)
        .single();

    if (tokenError || !tokenData) {
        return NextResponse.json({ error: 'Token inválido' }, { status: 404 });
    }

    if (!tokenData.is_active || new Date(tokenData.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Token expirado' }, { status: 401 });
    }

    const patientId = tokenData.patient_id;

    // 2. Fetch de todos los datos del paciente en paralelo
    const [
        patientRes,
        paymentsRes,
        treatmentRes,
        planRes,
        filesRes,
        appointmentRes,
    ] = await Promise.all([
        supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, email, whatsapp, estado_paciente')
            .eq('id_paciente', patientId)
            .single(),

        supabase
            .from('caja_recepcion_movimientos')
            .select('id, fecha_hora, fecha_movimiento, concepto_nombre, monto, moneda, estado, metodo_pago, cuota_nro, cuotas_total, comprobante_url')
            .eq('paciente_id', patientId)
            .eq('estado_registro', 'activo')
            .neq('estado', 'anulado')
            .order('fecha_hora', { ascending: true }),

        supabase
            .from('patient_treatments')
            .select('id, status, last_stage_change, workflow_id, current_stage_id, metadata')
            .eq('patient_id', patientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1),

        supabase
            .from('planes_tratamiento')
            .select('descripcion, total_usd, senal_usd, saldo_usd, estado_plan')
            .eq('paciente_id', patientId)
            .order('created_at', { ascending: false })
            .limit(1),

        supabase
            .from('patient_files')
            .select('id, file_type, label, file_url, thumbnail_url, created_at')
            .eq('patient_id', patientId)
            .eq('is_visible_to_patient', true)
            .order('created_at', { ascending: false }),

        supabase
            .from('agenda_appointments')
            .select('start_time, type, doctor_id')
            .eq('patient_id', patientId)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1),
    ]);

    if (!patientRes.data) {
        return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 });
    }

    // 3. Si hay tratamiento activo, buscar su workflow + etapas
    let treatment = null;
    let allStages = null;
    const allFiles = [...(filesRes.data || [])];

    if (treatmentRes.data && treatmentRes.data.length > 0) {
        const t = treatmentRes.data[0];

        // Fetch de Drive si hay carpeta configurada
        const metadata = (t.metadata as Record<string, any>) || {};
        if (metadata.drive_folder_id) {
            try {
                const { listFolderFiles } = await import('@/lib/google-drive');
                const driveFiles = await listFolderFiles(metadata.drive_folder_id);

                if (driveFiles.files) {
                    // Agregar archivos de Drive a la lista (especialmente STLs)
                    driveFiles.files.forEach(df => {
                        const isStl = df.name.toLowerCase().endsWith('.stl');
                        if (isStl) {
                            allFiles.push({
                                id: df.id,
                                file_type: 'stl',
                                label: df.name,
                                file_url: `/api/drive/file/${df.id}`,
                                thumbnail_url: null,
                                created_at: df.createdTime
                            });
                        }
                    });
                }
            } catch (err) {
                console.error('Error fetching Drive files for portal:', err);
            }
        }

        const [workflowRes, stageRes, allStagesRes] = await Promise.all([
            supabase
                .from('clinical_workflows')
                .select('name')
                .eq('id', t.workflow_id)
                .single(),

            supabase
                .from('workflow_stages')
                .select('name, order_index')
                .eq('id', t.current_stage_id)
                .single(),

            supabase
                .from('workflow_stages')
                .select('id, name, order_index')
                .eq('workflow_id', t.workflow_id)
                .order('order_index', { ascending: true }),
        ]);

        treatment = {
            id: t.id,
            status: t.status,
            last_stage_change: t.last_stage_change,
            workflow_name: workflowRes.data?.name || 'Tratamiento',
            current_stage_name: stageRes.data?.name || '',
            current_stage_order: stageRes.data?.order_index || 0,
        };

        allStages = allStagesRes.data || null;
    }

    // 4. Resolve receipt signed URLs for payments
    const payments = paymentsRes.data || [];
    const resolvedPayments = await Promise.all(
        payments.map(async (p: Record<string, unknown>) => {
            if (!p.comprobante_url || typeof p.comprobante_url !== 'string') return p;

            try {
                const url = p.comprobante_url as string;

                // New format: "storage:caja-recepcion:2026-02/recibo-xxx.jpg"
                if (url.startsWith('storage:')) {
                    const parts = url.split(':');
                    if (parts.length >= 3) {
                        const bucket = parts[1];
                        const path = parts.slice(2).join(':');
                        const { data: signedData } = await supabase.storage
                            .from(bucket)
                            .createSignedUrl(path, 60 * 60 * 2); // 2 hours
                        return { ...p, comprobante_url: signedData?.signedUrl || url };
                    }
                }

                // Legacy: already a URL — try to refresh if it's a Supabase signed URL  
                if (url.startsWith('https://') && url.includes('/object/sign/')) {
                    const match = new URL(url).pathname.match(/\/object\/sign\/([^/]+)\/(.+)/);
                    if (match) {
                        const { data: signedData } = await supabase.storage
                            .from(match[1])
                            .createSignedUrl(match[2], 60 * 60 * 2);
                        if (signedData?.signedUrl) return { ...p, comprobante_url: signedData.signedUrl };
                    }
                }

                return p;
            } catch {
                return p; // Return original on any error
            }
        })
    );

    return NextResponse.json({
        patient: patientRes.data,
        payments: resolvedPayments,
        treatment,
        allStages,
        plan: planRes.data?.[0] || null,
        files: allFiles,
        nextAppointment: appointmentRes.data?.[0] || null,
    });
}
