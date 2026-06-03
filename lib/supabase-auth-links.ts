type SupabaseGeneratedLink = {
    properties?: {
        hashed_token?: string;
    } | null;
};

type AuthEmailType = 'invite' | 'recovery';

export function buildAuthCallbackLink(
    publicUrl: string,
    linkData: SupabaseGeneratedLink,
    type: AuthEmailType,
    next = '/auth/update-password'
) {
    const tokenHash = linkData.properties?.hashed_token;

    if (!tokenHash) {
        throw new Error('Supabase no devolvio token_hash para generar el link de acceso');
    }

    const callbackUrl = new URL('/auth/callback', publicUrl);
    callbackUrl.searchParams.set('token_hash', tokenHash);
    callbackUrl.searchParams.set('type', type);
    callbackUrl.searchParams.set('next', next);

    return callbackUrl.toString();
}
