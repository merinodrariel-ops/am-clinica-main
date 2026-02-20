import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        return createBrowserClient(
            'http://localhost:3000',
            'dummy-key'
        )
    }

    return createBrowserClient(
        supabaseUrl,
        supabaseAnonKey
    )
}
