import 'server-only';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

const FROM = process.env.GMAIL_USER
    ? `AM Clínica <${process.env.GMAIL_USER}>`
    : 'AM Clínica <noreply@amclinica.com.ar>';

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
    try {
        const info = await transporter.sendMail({
            from: FROM,
            to,
            subject,
            html,
            attachments: attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
                encoding: a.encoding,
                contentType: a.contentType,
            })),
        });

        console.log('Email sent via Gmail:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email via Gmail:', error);
        const msg = error instanceof Error ? error.message : JSON.stringify(error);
        return { success: false, error: msg };
    }
}
