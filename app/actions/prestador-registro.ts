'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface PrestadorAutoRegistroInput {
    // Paso 1
    nombre: string;
    apellido: string;
    documento: string;
    fecha_nacimiento?: string;
    // Paso 2
    email: string;
    whatsapp: string;
    direccion?: string;
    barrio_localidad?: string;
    // Paso 3
    tipo_trabajo: string;
    condicion_afip?: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    // Paso 4
    cbu?: string;
    cbu_alias?: string;
    cuit?: string;
}

export async function registerPrestadorPublico(
    data: PrestadorAutoRegistroInput
): Promise<{ success?: true; error?: string }> {
    const adminSupabase = createAdminClient();

    // Duplicate check by documento
    const { data: existing } = await adminSupabase
        .from('personal')
        .select('id')
        .eq('documento', data.documento)
        .maybeSingle();

    if (existing) {
        return { error: 'Ya existe un prestador registrado con ese DNI.' };
    }

    const { error } = await adminSupabase.from('personal').insert({
        nombre: data.nombre,
        apellido: data.apellido,
        documento: data.documento,
        email: data.email,
        whatsapp: data.whatsapp,
        direccion: data.direccion || null,
        barrio_localidad: data.barrio_localidad || null,
        area: data.tipo_trabajo,
        tipo: 'prestador',
        condicion_afip: data.condicion_afip || null,
        cbu: data.cbu || null,
        cbu_alias: data.cbu_alias || null,
        cuit: data.cuit || null,
        activo: false,
        fuente_registro: 'autoregistro',
        fecha_ingreso: new Date().toISOString().split('T')[0],
    });

    if (error) {
        console.error('registerPrestadorPublico error:', error);
        return { error: 'Error al registrar. Intentá de nuevo.' };
    }

    revalidatePath('/caja-admin/personal');
    return { success: true };
}
