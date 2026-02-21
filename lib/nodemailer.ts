import 'server-only';
import { Resend } from 'resend';

const FROM = process.env.RESEND_FROM ?? 'AM Clínica <noreply@amclinica.com.ar>';

interface EmailAttachment {
    filename: string;
    content: string;
    encoding?: 'base64' | 'utf8' | 'ascii';
    contentType?: string;
}

export async function sendEmail({
    to,
    subject,
    html,
    attachments,
}: {
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
}) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
        const { data, error } = await resend.emails.send({
            from: FROM,
            to,
            subject,
            html,
            attachments: attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
            })),
        });

        if (error) {
            console.error('Resend error:', error);
            return { success: false, error };
        }

        console.log('Email sent via Resend:', data?.id);
        return { success: true, messageId: data?.id };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error };
    }
}
