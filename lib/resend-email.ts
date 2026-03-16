interface EmailAttachment {
    filename: string;
    content: string; // Base64 string if coming from frontend/buffer
    contentType?: string;
}

interface SendResendEmailInput {
    to: string | string[];
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
}

export async function sendResendEmail(input: SendResendEmailInput) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? 'AM Clínica <noreply@am-clinica.ar>';

    if (!apiKey) {
        console.error('RESEND_API_KEY no configurada');
        return { success: false, error: 'RESEND_API_KEY no configurada' };
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
                to: Array.isArray(input.to) ? input.to : [input.to],
                subject: input.subject,
                html: input.html,
                attachments: input.attachments?.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    contentType: a.contentType
                })),
                cc: input.cc,
                bcc: input.bcc,
                reply_to: input.replyTo
            }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('Resend API Error:', payload);
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
        console.error('Exception in sendResendEmail:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error enviando email con Resend',
        };
    }
}
