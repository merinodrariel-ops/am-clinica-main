import { createAdminClient } from '@/utils/supabase/admin';

export function normalizeDriveEditorEmails(emails: Array<string | null | undefined>): string[] {
    return [...new Set(
        emails
            .map((email) => email?.trim().toLowerCase() || '')
            .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )];
}

export async function getActiveLaboratoryEditorEmails(): Promise<{ emails: string[]; error?: string }> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('profiles')
        .select('email')
        .eq('categoria', 'laboratorio')
        .eq('is_active', true);

    if (error) {
        return { emails: [], error: error.message };
    }

    const emails = normalizeDriveEditorEmails((data || []).map((profile: { email: string | null }) => profile.email));
    if (emails.length === 0) {
        return { emails: [], error: 'No hay cuentas activas de laboratorio con email válido' };
    }

    return { emails };
}
