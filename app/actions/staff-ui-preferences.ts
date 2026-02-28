'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type StaffViewMode = 'board' | 'table';
export type StaffGroupMode = 'role' | 'company' | 'access' | 'compliance';

export interface StaffUiPreferencesInput {
    viewMode: StaffViewMode;
    groupMode: StaffGroupMode;
    onlyActive: boolean;
    denseMode: boolean;
    roleOrder: string[];
}

export interface StaffUiPreferences extends StaffUiPreferencesInput {}

function isValidViewMode(value: string): value is StaffViewMode {
    return value === 'board' || value === 'table';
}

function isValidGroupMode(value: string): value is StaffGroupMode {
    return value === 'role' || value === 'company' || value === 'access' || value === 'compliance';
}

function sanitizeRoleOrder(roleOrder: string[]): string[] {
    const clean = roleOrder
        .map((role) => role.trim())
        .filter((role) => role.length > 0)
        .slice(0, 25);

    return Array.from(new Set(clean));
}

export async function getStaffUiPreferences(): Promise<StaffUiPreferences | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data, error } = await supabase
        .from('staff_ui_preferences')
        .select('view_mode, group_mode, only_active, dense_mode, role_order')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const viewMode = isValidViewMode(data.view_mode) ? data.view_mode : 'board';
    const groupMode = isValidGroupMode(data.group_mode) ? data.group_mode : 'role';

    return {
        viewMode,
        groupMode,
        onlyActive: Boolean(data.only_active),
        denseMode: Boolean(data.dense_mode),
        roleOrder: Array.isArray(data.role_order)
            ? sanitizeRoleOrder(data.role_order.filter((r): r is string => typeof r === 'string'))
            : [],
    };
}

export async function saveStaffUiPreferences(input: StaffUiPreferencesInput): Promise<void> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    if (!isValidViewMode(input.viewMode)) throw new Error('viewMode inválido');
    if (!isValidGroupMode(input.groupMode)) throw new Error('groupMode inválido');

    const { error } = await supabase
        .from('staff_ui_preferences')
        .upsert(
            {
                user_id: user.id,
                view_mode: input.viewMode,
                group_mode: input.groupMode,
                only_active: input.onlyActive,
                dense_mode: input.denseMode,
                role_order: sanitizeRoleOrder(input.roleOrder),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
        );

    if (error) throw new Error(error.message);
    revalidatePath('/admin/staff');
}
