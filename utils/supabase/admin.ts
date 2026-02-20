import { createClient } from '@supabase/supabase-js';

/**
 * Creates a build-safe Supabase Admin client using the Service Role Key.
 * This should ONLY be used in server-side contexts (API Routes, Server Actions).
 */
export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        // During build time, environment variables might be missing.
        // We return a proxy that warned on access instead of crashing on initialization.
        if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
            // Basic check for build phase if needed, but usually just returning a dummy is safer
        }

        return new Proxy({} as any, {
            get(_, prop) {
                // If it's a known property that returns a builder, keep it going
                if (['from', 'auth', 'storage'].includes(String(prop))) {
                    return () => new Proxy({}, { get: () => () => ({ data: null, error: new Error('Supabase Admin Client not initialized: Missing environment variables') }) });
                }
                return undefined;
            }
        });
    }

    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}
