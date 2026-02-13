'use client';

import { createClient } from '@/utils/supabase/client';

export interface GoogleSignInOptions {
    redirectTo?: string;
    nextPath?: string;
    scopes?: string;
    prompt?: 'none' | 'consent' | 'select_account';
}

function buildDefaultRedirectTo(nextPath?: string) {
    const base = typeof window !== 'undefined'
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || '';

    if (!base) {
        throw new Error('No se pudo resolver APP URL para Google OAuth redirect');
    }

    const callback = new URL('/auth/callback', base);
    if (nextPath) {
        callback.searchParams.set('next', nextPath);
    }
    return callback.toString();
}

export async function signInWithGoogleOAuth(options: GoogleSignInOptions = {}) {
    const supabase = createClient();
    const redirectTo = options.redirectTo || buildDefaultRedirectTo(options.nextPath);

    return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo,
            scopes: options.scopes || 'openid email profile',
            queryParams: {
                prompt: options.prompt || 'select_account',
            },
        },
    });
}
