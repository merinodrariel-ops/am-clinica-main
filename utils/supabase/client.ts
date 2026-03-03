import { createBrowserClient } from '@supabase/ssr'

declare global {
    var __amBrowserSupabaseClient: ReturnType<typeof createBrowserClient> | undefined
}

export function createClient() {
    if (!globalThis.__amBrowserSupabaseClient) {
        globalThis.__amBrowserSupabaseClient = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
    }

    return globalThis.__amBrowserSupabaseClient
}
