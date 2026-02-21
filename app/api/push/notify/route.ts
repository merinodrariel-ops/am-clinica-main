import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    const { userId, title, body, url, tag } = await request.json();
    if (!userId || !title) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    // Fetch all subscriptions for this user
    const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

    if (error || !subs?.length) {
        return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({ title, body, url: url || '/todos', tag: tag || 'am-tarea' });
    const results = await Promise.allSettled(
        subs.map((sub) =>
            webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            )
        )
    );

    // Clean up expired subscriptions (410 Gone)
    const expired = results
        .map((r, i) => r.status === 'rejected' && (r.reason as { statusCode?: number })?.statusCode === 410 ? subs[i].endpoint : null)
        .filter(Boolean);
    if (expired.length) {
        await supabase.from('push_subscriptions').delete().in('endpoint', expired as string[]);
    }

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ sent });
}
