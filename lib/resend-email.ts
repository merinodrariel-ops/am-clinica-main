import 'server-only';

interface SendResendEmailInput {
    to: string;
    subject: string;
    html: string;
}

export async function sendResendEmail(input: SendResendEmailInput) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey) {
        return { success: false, error: 'RESEND_API_KEY no configurada' };
    }

    if (!fromEmail) {
        return { success: false, error: 'RESEND_FROM_EMAIL no configurado' };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromEmail,
                to: [input.to],
                subject: input.subject,
                html: input.html,
            }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                success: false,
                error: typeof payload?.message === 'string' ? payload.message : `Resend error ${response.status}`,
            };
        }

        return {
            success: true,
            id: typeof payload?.id === 'string' ? payload.id : undefined,
        };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error enviando email con Resend',
        };
    }
}
