'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface NewItemData {
    nombre: string;
    categoria: string;
    stock_actual: number;
    unidad_medida: string;
    stock_minimo: number;
    area: 'CLINICA' | 'LABORATORIO';
    userId: string;
}

export async function crearItem(data: NewItemData) {
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
            console.error('Permission check failed in crearItem:', { userId: data.userId, userError });
            return { success: false, error: `Error al verificar perfil: ${userError?.message || 'Usuario no encontrado'}. ID: ${data.userId.substring(0, 8)}` };
        }

        // 2. Permission Check
        const HARDCODED_OWNER = 'dr.arielmerinopersonal@gmail.com'.toLowerCase();
        const userEmail = (user.email || '').toLowerCase();
        const isOwnerByEmail = userEmail === HARDCODED_OWNER;

        const isSuperUser = isOwnerByEmail || ['owner', 'admin', 'developer', 'reception'].includes(user.role);

        if (!isSuperUser) {
            if (user.role === 'laboratorio') {
                if (data.area !== 'LABORATORIO') {
                    return { success: false, error: 'Solo puedes crear items en LABORATORIO.' };
                }
            } else {
                return { success: false, error: `No tienes permisos para crear items. Rol: ${user.role}. Email: ${user.email}` };
            }
        }

        // 3. Create Item (Bypassing RLS)
        const { error: insertError, data: newItem } = await supabaseAdmin
            .from('inventario_items')
            .insert({
                nombre: data.nombre,
                categoria: data.categoria,
                stock_actual: data.stock_actual,
                unidad_medida: data.unidad_medida,
                stock_minimo: data.stock_minimo,
                area: data.area
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 4. Create Initial Stock Movement (if stock > 0)
        if (data.stock_actual > 0) {
            await supabaseAdmin.from('inventario_movimientos').insert({
                item_id: newItem.id,
                tipo_movimiento: 'AJUSTE',
                cantidad: data.stock_actual,
                motivo: 'Carga inicial de stock',
                usuario: user.email || 'Sistema'
            });
        }

        revalidatePath('/inventario');
        return { success: true };

    } catch (error: any) {
        console.error('Error creating item:', error);
        return { success: false, error: error.message || 'Error al guardar el item' };
    }
}
