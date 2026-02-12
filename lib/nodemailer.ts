import 'server-only';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

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
            from: `"AM Clínica" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html,
            attachments,
        });
        console.log("Message sent: %s", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("Error sending email:", error);
        return { success: false, error };
    }
}
