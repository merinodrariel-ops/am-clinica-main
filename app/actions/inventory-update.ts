'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ItemUpdateData {
    id: string;
    nombre: string;
    categoria: string;
    stock_actual: number;
    unidad_medida: string;
    stock_minimo: number;
    area: 'CLINICA' | 'LABORATORIO';
    marca?: string;
    proveedor?: string;
    descripcion?: string;
    link?: string;
    userId: string;
}

export async function actualizarItem(data: ItemUpdateData) {
    if (!data.userId) {
        return { success: false, error: 'Usuario no identificado' };
    }

    try {
        // 1. Get User Role
        const { data: user, error: userError } = await supabaseAdmin
            .from('profiles')
            .select('role, email')
            .eq('id', data.userId)
            .single();

        if (userError || !user) {
            return { success: false, error: 'Error al verificar permisos del usuario' };
        }

        // 2. Permission Check
        const HARDCODED_OWNER = 'dr.arielmerinopersonal@gmail.com'.toLowerCase();
        const userEmail = (user.email || '').toLowerCase();
        const isOwnerByEmail = userEmail === HARDCODED_OWNER;

        const isSuperUser = isOwnerByEmail || ['owner', 'admin', 'developer', 'reception'].includes(user.role);

        if (!isSuperUser) {
            // Lab user check
            if (user.role === 'laboratorio') {
                if (data.area !== 'LABORATORIO') {
                    return { success: false, error: 'Solo puedes editar items del LABORATORIO.' };
                }
                // Also check if the *existing* item is LABORATORIO (prevent stealing items)
                const { data: existingItem } = await supabaseAdmin
                    .from('inventario_items')
                    .select('area')
                    .eq('id', data.id)
                    .single();

                if (existingItem?.area !== 'LABORATORIO') {
                    return { success: false, error: 'No tienes permiso para editar este item (Área restringida).' };
                }
            } else {
                return { success: false, error: `No tienes permisos para editar inventario. Rol: ${user.role}. Email: ${user.email}` };
            }
        }

        // 3. Update Item (Bypassing RLS)
        const { error: updateError } = await supabaseAdmin
            .from('inventario_items')
            .update({
                nombre: data.nombre,
                categoria: data.categoria,
                stock_actual: data.stock_actual,
                unidad_medida: data.unidad_medida,
                stock_minimo: data.stock_minimo,
                area: data.area,
                marca: data.marca,
                proveedor: data.proveedor,
                descripcion: data.descripcion,
                link: data.link
            })
            .eq('id', data.id);

        if (updateError) throw updateError;

        revalidatePath('/inventario');
        return { success: true };

    } catch (error: any) {
        console.error('Error updating item:', error);
        return { success: false, error: error.message || 'Error al actualizar el item' };
    }
}
