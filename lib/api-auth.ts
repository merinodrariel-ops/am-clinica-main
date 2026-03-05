
import { createClient } from '@/utils/supabase/server';
import { NextRequest } from 'next/server';

export async function authorizeRequest(request: Request | NextRequest) {
    const CRON_SECRET = process.env.CRON_SECRET;
    const authHeader = request.headers.get('Authorization');

    // 1. Check Cron Secret (for automated jobs)
    if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
        return { authorized: true, categoria: 'admin' };
    }

    // 2. Check User Session (for manual triggering from UI)
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { authorized: false, error: 'Unauthorized' };
    }

    // 3. Check Categoria
    let categoria = user.user_metadata?.categoria;

    // Optional: fetch from profiles if needed, but metadata is usually faster for middleware-like checks
    if (!categoria) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .maybeSingle();
        categoria = profile?.categoria;
    }

    const effectiveCategoria = (categoria || '').toLowerCase();

    if (effectiveCategoria === 'admin' || effectiveCategoria === 'owner') {
        return { authorized: true, categoria: effectiveCategoria, user };
    }

    return { authorized: false, error: 'Forbidden: Admin category required' };
}
