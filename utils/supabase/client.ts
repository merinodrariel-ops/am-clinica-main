import { createBrowserClient } from '@supabase/ssr'

declare global {
    var __amBrowserSupabaseClient: ReturnType<typeof createBrowserClient> | undefined
}

function createMissingEnvClient() {
    let chain: any
    const noop = () => chain
    chain = new Proxy(noop, {
        get(_, prop) {
            if (prop === 'then') return undefined
            if (prop === 'data') return null
            if (prop === 'error') {
                return new Error('Supabase Browser Client not initialized: Missing environment variables')
            }
            return chain
        },
        apply() {
            return chain
        },
    })

    return chain as unknown as ReturnType<typeof createBrowserClient>
}

export function createClient() {
    if (!globalThis.__amBrowserSupabaseClient) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            return createMissingEnvClient()
        }

        globalThis.__amBrowserSupabaseClient = createBrowserClient(
            supabaseUrl,
            supabaseAnonKey
        )
    }

    return globalThis.__amBrowserSupabaseClient
}
