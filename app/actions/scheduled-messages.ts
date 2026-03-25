'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export interface ScheduleMessageInput {
    patientId: string;
    channel: 'whatsapp' | 'email';
    phone?: string;
    email?: string;
    message: string;
    mediaUrl?: string;
    scheduledFor: string; // ISO string
}

export interface ScheduleMessageBatchInput {
    patientId: string;
    channel: 'whatsapp' | 'email';
    phone?: string;
    email?: string;
    message: string;
    mediaUrls?: string[];
    scheduledFor: string; // ISO string
}

export async function schedulePatientMessageAction(input: ScheduleMessageInput) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autenticado' };

    const admin = createAdminClient();
    const { error } = await admin.from('scheduled_messages').insert({
        patient_id: input.patientId,
        channel: input.channel,
        phone: input.phone ?? null,
        email: input.email ?? null,
        message: input.message,
        media_url: input.mediaUrl ?? null,
        scheduled_for: input.scheduledFor,
        created_by: user.id,
    });

    if (error) return { error: error.message };
    return { success: true };
}

export async function schedulePatientMessageBatchAction(input: ScheduleMessageBatchInput) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autenticado' };

    const admin = createAdminClient();
    const mediaUrls = input.mediaUrls && input.mediaUrls.length > 0 ? input.mediaUrls : [null];
    const rows = mediaUrls.map((mediaUrl) => ({
        patient_id: input.patientId,
        channel: input.channel,
        phone: input.phone ?? null,
        email: input.email ?? null,
        message: input.message,
        media_url: mediaUrl,
        scheduled_for: input.scheduledFor,
        created_by: user.id,
    }));

    const { error } = await admin.from('scheduled_messages').insert(rows);
    if (error) return { error: error.message };

    return { success: true, count: rows.length };
}

export async function getPatientContactAction(patientId: string) {
    const admin = createAdminClient();
    const { data } = await admin
        .from('pacientes')
        .select('nombre, apellido, whatsapp, email')
        .eq('id_paciente', patientId)
        .single();
    return data;
}
