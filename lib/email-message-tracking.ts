export const EMAIL_MESSAGE_STATUS_LABELS = {
  queued: 'En cola',
  sending: 'Enviando',
  sent: 'Enviado al proveedor',
  failed: 'Fallido',
  skipped: 'Omitido',
  delivered: 'Entregado',
  bounced: 'Rebotado',
  opened: 'Abierto',
  clicked: 'Click',
  cancelled: 'Cancelado',
} as const;

export const EMAIL_MESSAGE_TYPE_LABELS = {
  appointment_reminder: 'Recordatorio de turno',
  appointment_confirmation: 'Confirmacion de turno',
  appointment_cancellation: 'Cancelacion de turno',
  survey_first_visit: 'Encuesta primera visita',
  survey_post_appointment: 'Encuesta post-turno',
  portal_invitation: 'Invitacion portal',
  password_reset: 'Restablecer contrasena',
  workflow_notification: 'Workflow clinico',
  treatment_followup: 'Seguimiento tratamiento',
  budget: 'Presupuesto',
  payment_confirmation: 'Confirmacion de pago',
  doctor_daily_agenda: 'Agenda diaria profesional',
  recall: 'Recall preventivo',
  upsell: 'Upgrade comercial',
  cross_sell: 'Venta cruzada',
  orthodontic_followup: 'Control ortodoncia',
  test: 'Prueba',
  other: 'Otro',
} as const;

export type EmailMessageStatus = keyof typeof EMAIL_MESSAGE_STATUS_LABELS;
export type EmailMessageType = keyof typeof EMAIL_MESSAGE_TYPE_LABELS;

export interface ProviderStatusInput {
  resendApiKey?: string | null;
  resendFrom?: string | null;
  brevoApiKey?: string | null;
}

export interface EmailProviderStatus {
  activeProvider: 'resend';
  providers: Array<{
    key: 'resend' | 'brevo';
    label: string;
    configured: boolean;
    mode: 'transaccional' | 'contactos';
    from: string | null;
    notes: string;
  }>;
}

export function resolveEmailMessageStatusLabel(status: string | null | undefined) {
  if (!status) return 'Sin estado';
  return EMAIL_MESSAGE_STATUS_LABELS[status as EmailMessageStatus] ?? status;
}

export function resolveEmailMessageTypeLabel(type: string | null | undefined) {
  if (!type) return 'Sin tipo';
  return EMAIL_MESSAGE_TYPE_LABELS[type as EmailMessageType] ?? type;
}

export function normalizeEmailMessageRecipients(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function redactSensitiveEmailHtml(html: string | null | undefined) {
  if (!html) return '';

  return html
    .replace(/(token_hash=)[^"&<\s]+/gi, '$1[redacted]')
    .replace(/(access_token=)[^"&<\s]+/gi, '$1[redacted]')
    .replace(/(refresh_token=)[^"&<\s]+/gi, '$1[redacted]')
    .replace(/(code=)[^"&<\s]+/gi, '$1[redacted]');
}

export function buildProviderStatus(input: ProviderStatusInput): EmailProviderStatus {
  return {
    activeProvider: 'resend',
    providers: [
      {
        key: 'resend',
        label: 'Resend',
        configured: Boolean(input.resendApiKey),
        mode: 'transaccional',
        from: input.resendFrom || null,
        notes: 'Proveedor activo para emails enviados desde la app.',
      },
      {
        key: 'brevo',
        label: 'Brevo',
        configured: Boolean(input.brevoApiKey),
        mode: 'contactos',
        from: null,
        notes: 'Hoy esta previsto para sincronizacion/contactos; no es el sender transaccional activo.',
      },
    ],
  };
}
