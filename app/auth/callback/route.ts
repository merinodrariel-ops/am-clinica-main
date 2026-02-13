import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { syncUserProfileAndSendFirstWelcome } from '@/lib/auth-welcome';

function normalizeOtpType(type: string | null): EmailOtpType {
    const value = (type || '').toLowerCase();
    if (value === 'magiclink') return 'email';

    const allowed: EmailOtpType[] = [
        'signup',
        'invite',
        'magiclink',
        'recovery',
        'email_change',
        'email',
    ];

    return allowed.includes(value as EmailOtpType)
        ? (value as EmailOtpType)
        : 'email';
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/dashboard';

    if (tokenHash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: normalizeOtpType(type),
        });

        if (!error) {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (user) {
                const syncResult = await syncUserProfileAndSendFirstWelcome(user);
                if (!syncResult.success) {
                    console.error('[AUTH_WELCOME_SYNC_ERROR]', syncResult.error);
                }
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (user) {
                const syncResult = await syncUserProfileAndSendFirstWelcome(user);
                if (!syncResult.success) {
                    console.error('[AUTH_WELCOME_SYNC_ERROR]', syncResult.error);
                }
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    return NextResponse.redirect(`${origin}/login?error=No%20se%20pudo%20validar%20el%20link%20de%20acceso`);
}
