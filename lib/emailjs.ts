// EmailJS Configuration
// https://www.emailjs.com/

// EmailJS configuration is no longer used directly;
// the app now uses Nodemailer via lib/nodemailer.ts

interface EmailData {
  to_email: string;
  to_name: string;
  message: string;
  website_link?: string;
  whatsapp_link?: string;
  maps_link?: string;
  action_link?: string;
}

interface InvitationData {
  to_email: string;
  to_name: string;
  action_link: string;
}

import { sendEmail } from '@/lib/nodemailer';

export async function sendWelcomeEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await sendEmail({
      to: data.to_email,
      subject: `Bienvenido a AM Clínica - ${data.to_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body>
            <p>Este es un correo enviado via Gmail/Nodemailer.</p>
            <p>${data.message}</p>
        </body>
        </html>
      ` // We should ideally use a proper template generator
    });

    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: String(response.error) };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

import { generateWelcomeMessage, generateInvitationMessage } from '@/lib/email-templates';

export { generateWelcomeMessage, generateInvitationMessage }; // Re-export for compatibility if needed, but better to import directly.

export async function sendInvitationEmail(data: InvitationData): Promise<{ success: boolean; error?: string }> {
  const htmlMessage = generateInvitationMessage(data.to_name, data.action_link);

  const response = await sendEmail({
    to: data.to_email,
    subject: `Invitación a AM Clínica - ${data.to_name}`,
    html: htmlMessage
  });

  if (response.success) {
    return { success: true };
  } else {
    return { success: false, error: String(response.error) };
  }
}
