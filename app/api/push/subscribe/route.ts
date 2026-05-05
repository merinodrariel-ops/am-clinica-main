import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        throw new Error('Faltan variables de entorno de Supabase');
    }

    return createClient(supabaseUrl, serviceKey);
}

// POST — save a push subscription for the current user
export async function POST(request: Request) {
    const { userId, subscription } = await request.json();
    if (!userId || !subscription?.endpoint) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const { endpoint, keys } = subscription;
    const supabase = getSupabase();
    const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
            { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
            { onConflict: 'endpoint' }
        );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

// DELETE — remove a push subscription
export async function DELETE(request: Request) {
    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

    const supabase = getSupabase();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    return NextResponse.json({ ok: true });
}
