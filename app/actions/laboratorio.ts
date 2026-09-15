'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { sendEmail } from '@/lib/email-service';

type LaboratoryContact = { name: string; email: string };

function normalizeEmail(value: string) {
    return value.trim().toLowerCase();
}

function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function normalizeNote(value: string) {
    return value.trim().slice(0, 10000);
}

export async function getLaboratoryRecipientDirectory(): Promise<{
    contacts: LaboratoryContact[];
    defaultEmails: string[];
}> {
    const supabase = await createClient();
    const { data: contacts } = await supabase
        .from('personal')
        .select('nombre, apellido, email')
        .eq('activo', true)
        .not('email', 'is', null)
        .order('apellido');

    const { data: workflow } = await supabase
        .from('clinical_workflows')
        .select('id')
        .eq('name', 'Diseño de Sonrisa')
        .eq('active', true)
        .maybeSingle();

    let defaultEmails: string[] = [];
    if (workflow?.id) {
        const { data: stage } = await supabase
            .from('clinical_workflow_stages')
            .select('notify_emails')
            .eq('workflow_id', workflow.id)
            .ilike('name', '%escaneo digital%')
            .maybeSingle();
        defaultEmails = Array.isArray(stage?.notify_emails)
            ? stage.notify_emails.map(email => normalizeEmail(String(email))).filter(Boolean)
            : [];
    }

    return {
        contacts: (contacts || [])
            .filter(row => typeof row.email === 'string' && row.email.trim())
            .map(row => ({
                name: [row.nombre, row.apellido].filter(Boolean).join(' '),
                email: normalizeEmail(row.email as string),
            })),
        defaultEmails,
    };
}

export async function createLaboratoryOrderAction(input: {
    patientId: string;
    type: string;
    professionalId?: string;
    laboratoryName?: string;
    sendDate: string;
    estimatedDelivery?: string;
    costUsd?: number;
    quantity: number;
    pieces?: string;
    color?: string;
    material?: string;
    scanned: string;
    notes?: string;
    recipientEmails?: string[];
}): Promise<{ ok: boolean; error?: string; orderId?: string; notified?: number }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'No autenticado' };

    const type = input.type.trim().slice(0, 160);
    if (!input.patientId || !type) return { ok: false, error: 'Paciente y tipo de trabajo son obligatorios' };

    const emails = Array.from(new Set((input.recipientEmails || []).map(normalizeEmail).filter(Boolean)));
    if (emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return { ok: false, error: 'Hay un email de destinatario inválido' };
    }

    const technicalDetails = [
        `Cantidad: ${Math.min(99, Math.max(1, Number(input.quantity) || 1))}`,
        input.pieces?.trim() ? `Piezas: ${input.pieces.trim().slice(0, 500)}` : '',
        input.color?.trim() ? `Color: ${input.color.trim().slice(0, 200)}` : '',
        input.material?.trim() ? `Material: ${input.material.trim().slice(0, 200)}` : '',
        `Escaneado digital: ${input.scanned}`,
        input.notes?.trim() ? `Notas: ${normalizeNote(input.notes)}` : '',
    ].filter(Boolean).join('\n');

    const { data: order, error: orderError } = await supabase
        .from('laboratorio_trabajos')
        .insert({
            paciente_id: input.patientId,
            profesional_id: input.professionalId || null,
            tipo_trabajo: type,
            laboratorio_nombre: input.laboratoryName?.trim() || null,
            fecha_envio: input.sendDate,
            fecha_entrega_estimada: input.estimatedDelivery || null,
            costo_usd: Number(input.costUsd) || 0,
            observaciones: technicalDetails,
            estado: 'Enviado',
        })
        .select('id')
        .single();

    if (orderError || !order) return { ok: false, error: orderError?.message || 'No se pudo guardar la orden' };

    let workflowId: string | null = null;
    let stageId: string | null = null;
    const { data: workflow } = await supabase
        .from('clinical_workflows')
        .select('id')
        .eq('name', 'Diseño de Sonrisa')
        .eq('active', true)
        .maybeSingle();

    if (workflow?.id) {
        workflowId = workflow.id;
        const { data: stages } = await supabase
            .from('clinical_workflow_stages')
            .select('id, name, order_index, notify_emails')
            .eq('workflow_id', workflow.id)
            .order('order_index');
        const stage = (stages || []).find(item => item.name.toLowerCase().includes('escaneo digital')) || stages?.[0];
        if (stage) {
            stageId = stage.id;
            const { data: existing } = await supabase
                .from('patient_treatments')
                .select('id, metadata')
                .eq('patient_id', input.patientId)
                .eq('workflow_id', workflow.id)
                .neq('status', 'archived')
                .limit(1)
                .maybeSingle();

            if (existing?.id) {
                await supabase.from('patient_treatments').update({ metadata: { ...(existing.metadata || {}), laboratory_order_id: order.id } }).eq('id', existing.id);
            } else {
                const { data: treatment } = await supabase.from('patient_treatments').insert({
                    patient_id: input.patientId,
                    workflow_id: workflow.id,
                    current_stage_id: stage.id,
                    doctor_id: user.id,
                    start_date: new Date().toISOString(),
                    last_stage_change: new Date().toISOString(),
                    metadata: { source: 'laboratory_order', laboratory_order_id: order.id },
                    status: 'active',
                }).select('id').single();
                if (treatment?.id) {
                    await supabase.from('treatment_history').insert({ treatment_id: treatment.id, new_stage_id: stage.id, comments: `Orden de laboratorio creada: ${order.id}` });
                }
            }
        }
    }

    if (emails.length > 0) {
        const { data: patient } = await supabase.from('pacientes').select('nombre, apellido').eq('id_paciente', input.patientId).maybeSingle();
        const patientName = [patient?.nombre, patient?.apellido].filter(Boolean).join(' ') || 'Paciente';
        const subject = `Nueva orden de diseño — ${patientName}`;
        const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');
        const patientUrl = `${appBaseUrl}/patients/${encodeURIComponent(input.patientId)}?section=laboratorio`;
        const html = `<div style="font-family:Arial,sans-serif;color:#172033"><h2>Nueva orden de diseño</h2><p>Se recibió una orden para <strong>${escapeHtml(patientName)}</strong>.</p><p><strong>Tipo:</strong> ${escapeHtml(type)}<br/><strong>Laboratorio:</strong> ${escapeHtml(input.laboratoryName || 'A definir')}</p><pre style="white-space:pre-wrap;font-family:Arial;line-height:1.6;background:#f4f6fa;padding:16px;border-radius:8px">${escapeHtml(technicalDetails)}</pre><p><a href="${patientUrl}">Abrir ficha y orden en AM Clínica</a></p></div>`;
        const result = await sendEmail({ to: emails, subject, html, workflowId, patientId: input.patientId, sourceModule: 'laboratorio', templateKey: 'laboratory_order_created', idempotencyKey: `laboratory_order_created:${order.id}` });
        for (const email of emails) {
            await supabase.from('workflow_notifications_log').insert({ workflow_id: workflowId, stage_id: stageId, event_type: 'laboratory_order_created', recipient_email: email, subject, status: result.success ? 'sent' : 'failed', error_message: result.success ? null : String(result.error || 'unknown_error'), event_key: `laboratory_order_created:${order.id}:${email}` }).then(() => undefined);
        }
    }

    revalidatePath(`/patients/${input.patientId}`);
    revalidatePath('/workflows');
    return { ok: true, orderId: order.id, notified: emails.length };
}
