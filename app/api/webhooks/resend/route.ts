import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';

// Resend signs webhooks with Svix. Verification: HMAC-SHA256 over
// `${svix-id}.${svix-timestamp}.${rawBody}` using the base64 portion of the
// whsec_ secret; signature header carries space-separated "v1,<base64>" entries.
// https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests

const TOLERANCE_SECONDS = 5 * 60;

function verifySvixSignature(secret: string, headers: Headers, rawBody: string): boolean {
    const id = headers.get('svix-id');
    const timestamp = headers.get('svix-timestamp');
    const signatures = headers.get('svix-signature');
    if (!id || !timestamp || !signatures) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto
        .createHmac('sha256', secretBytes)
        .update(`${id}.${timestamp}.${rawBody}`)
        .digest('base64');

    return signatures.split(' ').some((entry) => {
        const [, sig] = entry.split(',');
        if (!sig) return false;
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

// Higher number wins — a late "delivered" event must not downgrade "opened".
const STATUS_RANK: Record<string, number> = {
    sending: 0,
    queued: 0,
    sent: 1,
    delivered: 2,
    opened: 3,
    clicked: 4,
    failed: 5,
    bounced: 5,
};

type ResendEvent = {
    type: string;
    created_at?: string;
    data?: {
        email_id?: string;
        bounce?: { message?: string };
    };
};

export async function POST(request: Request) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
        console.error('[webhooks/resend] RESEND_WEBHOOK_SECRET not configured');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const rawBody = await request.text();
    if (!verifySvixSignature(secret, request.headers, rawBody)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let event: ResendEvent;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const emailId = event.data?.email_id;
    if (!emailId) return NextResponse.json({ received: true });

    const occurredAt = event.created_at ?? new Date().toISOString();
    const update: Record<string, unknown> = {};
    let nextStatus: string | null = null;

    switch (event.type) {
        case 'email.delivered':
            update.delivered_at = occurredAt;
            nextStatus = 'delivered';
            break;
        case 'email.opened':
            update.opened_at = occurredAt;
            nextStatus = 'opened';
            break;
        case 'email.clicked':
            update.clicked_at = occurredAt;
            nextStatus = 'clicked';
            break;
        case 'email.bounced':
            update.bounced_at = occurredAt;
            update.error_message = event.data?.bounce?.message ?? 'bounced';
            nextStatus = 'bounced';
            break;
        case 'email.complained':
            update.error_message = 'spam_complaint';
            nextStatus = 'bounced';
            break;
        case 'email.delivery_delayed':
            update.error_message = 'delivery_delayed';
            break;
        default:
            return NextResponse.json({ received: true });
    }

    try {
        const supabase = createAdminClient();
        const { data: rows, error: findError } = await supabase
            .from('email_messages')
            .select('id, status')
            .eq('provider_message_id', emailId);

        if (findError) {
            console.error('[webhooks/resend] lookup failed:', findError.message);
            return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
        }

        for (const row of rows ?? []) {
            const rowUpdate = { ...update };
            if (nextStatus && (STATUS_RANK[nextStatus] ?? 0) >= (STATUS_RANK[row.status] ?? 0)) {
                rowUpdate.status = nextStatus;
            }
            const { error: updateError } = await supabase
                .from('email_messages')
                .update(rowUpdate)
                .eq('id', row.id);
            if (updateError) {
                console.error('[webhooks/resend] update failed:', updateError.message);
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('[webhooks/resend] error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
