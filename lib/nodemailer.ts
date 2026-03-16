import 'server-only';
import { EmailService } from './email-service';

/**
 * DEPRECATED: Use EmailService from @/lib/email-service instead.
 * This file now acts as a proxy to Resend to ensure no emails are sent via Gmail.
 */

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
    console.warn('DEPRECATED: sendEmail from nodemailer.ts is deprecated. Using Resend instead.');
    
    try {
        const response = await EmailService.send({
            to,
            subject,
            html,
            attachments: attachments?.map(a => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType
            }))
        });

        if (response.success) {
            return { success: true, messageId: (response as any).id };
        } else {
            return { success: false, error: (response as any).error };
        }
    } catch (error) {
        console.error('Error in nodemailer proxy:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
