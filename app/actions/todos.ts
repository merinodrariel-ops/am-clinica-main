'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export interface TodoAssigneeOption {
    id: string;
    full_name: string | null;
    categoria: string;
    user_id: string | null;
}

export async function getAssignableTodoMembersAction(): Promise<{ success: boolean; data: TodoAssigneeOption[]; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, data: [], error: 'No autenticado' };
        }

        const admin = createAdminClient();

        const { data: personalData, error: personalError } = await admin
            .from('personal')
            .select('id, user_id, nombre, apellido, tipo, area, activo')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (!personalError && personalData && personalData.length > 0) {
            const unique = new Map<string, TodoAssigneeOption>();

            for (const row of personalData) {
                const optionId = row.id;
                if (!optionId || unique.has(optionId)) continue;

                const fullName = `${row.nombre || ''} ${row.apellido || ''}`.trim() || null;
                const normalizedArea = (row.area || '').toLowerCase();
                const categoria = row.tipo === 'odontologo' || row.tipo === 'profesional'
                    ? 'odontologo'
                    : normalizedArea.includes('laboratorio')
                        ? 'laboratorio'
                        : 'prestador';

                unique.set(optionId, {
                    id: optionId,
                    full_name: fullName,
                    categoria,
                    user_id: row.user_id || null,
                });
            }

            return { success: true, data: Array.from(unique.values()) };
        }

        const { data: profilesData, error: profilesError } = await admin
            .from('profiles')
            .select('id, full_name, categoria, is_active')
            .eq('is_active', true)
            .order('full_name', { ascending: true });

        if (profilesError) {
            return { success: false, data: [], error: profilesError.message };
        }

        const data = (profilesData || []).map((row) => ({
            id: `profile:${row.id}`,
            full_name: row.full_name,
            categoria: row.categoria || 'prestador',
            user_id: row.id,
        }));

        return { success: true, data };
    } catch (error) {
        return {
            success: false,
            data: [],
            error: error instanceof Error ? error.message : 'No se pudo cargar asignables',
        };
    }
}
