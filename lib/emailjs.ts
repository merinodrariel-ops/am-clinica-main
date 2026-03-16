// EmailJS Configuration
// https://www.emailjs.com/

// EmailJS configuration is no longer used directly;
// the app now uses Resend via lib/email-service.ts

import { EmailService } from '@/lib/email-service';
import { generatePremiumWelcomeEmail, generateInvitationMessage } from '@/lib/email-templates';

interface EmailData {
  to_email: string;
  to_name: string;
  message?: string;
}

interface InvitationData {
  to_email: string;
  to_name: string;
  action_link: string;
}

export async function sendWelcomeEmail(data: EmailData): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await EmailService.sendWelcome(data.to_name, data.to_email);

    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: (response as any).error ?? 'Error desconocido al enviar email' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function sendInvitationEmail(data: InvitationData): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await EmailService.sendInvitation(data.to_name, data.to_email, data.action_link);

    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: (response as any).error ?? 'Error desconocido al enviar email' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export { generatePremiumWelcomeEmail, generateInvitationMessage };
