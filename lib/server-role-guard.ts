import 'server-only';
import { createClient } from '@/utils/supabase/server';

/**
 * Guardas de autorización para server actions.
 *
 * Los server actions son endpoints HTTP invocables por cualquier cliente:
 * el middleware protege las *páginas*, pero no impide llamar a una action
 * directamente. Toda action que use el cliente admin (service-role, que
 * saltea RLS) debe verificar acá quién la invoca.
 */

export type StaffRole = 'owner' | 'admin' | 'developer' | 'partner_viewer' | 'reception' | 'asistente' | 'odontologo' | 'dentist' | 'laboratorio';

/** Roles que administran dinero/nóminas. */
export const MANAGE_ROLES: StaffRole[] = ['owner', 'admin', 'developer'];
/** Roles con acceso de lectura a vistas administrativas (incluye socio viewer). */
export const ADMIN_VIEW_ROLES: StaffRole[] = ['owner', 'admin', 'developer', 'partner_viewer'];

async function getAuthContext(): Promise<{ userId: string; role: string } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    const role = (profile?.categoria || user.user_metadata?.categoria || user.user_metadata?.role || '').toLowerCase();
    return { userId: user.id, role };
}

/** Exige usuario autenticado (cualquier rol del staff). Lanza si no. */
export async function assertAuthenticated(actionLabel: string): Promise<{ userId: string; role: string }> {
    const ctx = await getAuthContext();
    if (!ctx) throw new Error(`No autenticado: iniciá sesión para ${actionLabel}.`);
    return ctx;
}

/** Exige uno de los roles indicados. Lanza si no cumple. */
export async function assertRole(allowed: readonly string[], actionLabel: string): Promise<{ userId: string; role: string }> {
    const ctx = await assertAuthenticated(actionLabel);
    if (!allowed.includes(ctx.role)) {
        throw new Error(`Sin permisos para ${actionLabel}.`);
    }
    return ctx;
}
