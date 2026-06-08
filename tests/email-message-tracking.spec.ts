import assert from 'node:assert/strict';
import {
  EMAIL_MESSAGE_STATUS_LABELS,
  EMAIL_MESSAGE_TYPE_LABELS,
  buildProviderStatus,
  normalizeEmailMessageRecipients,
  redactSensitiveEmailHtml,
  resolveEmailMessageStatusLabel,
  resolveEmailMessageTypeLabel,
} from '../lib/email-message-tracking';

assert.equal(resolveEmailMessageStatusLabel('sent'), 'Enviado al proveedor');
assert.equal(resolveEmailMessageStatusLabel('delivered'), 'Entregado');
assert.equal(resolveEmailMessageStatusLabel('unknown_status'), 'unknown_status');
assert.equal(EMAIL_MESSAGE_STATUS_LABELS.failed, 'Fallido');

assert.equal(resolveEmailMessageTypeLabel('survey_first_visit'), 'Encuesta primera visita');
assert.equal(resolveEmailMessageTypeLabel('password_reset'), 'Restablecer contrasena');
assert.equal(resolveEmailMessageTypeLabel('recall'), 'Recall preventivo');
assert.equal(resolveEmailMessageTypeLabel('upsell'), 'Upgrade comercial');
assert.equal(resolveEmailMessageTypeLabel('cross_sell'), 'Venta cruzada');
assert.equal(resolveEmailMessageTypeLabel('orthodontic_followup'), 'Control ortodoncia');
assert.equal(resolveEmailMessageTypeLabel('custom_type'), 'custom_type');
assert.equal(EMAIL_MESSAGE_TYPE_LABELS.test, 'Prueba');
assert.equal(EMAIL_MESSAGE_STATUS_LABELS.skipped, 'Omitido');

assert.deepEqual(normalizeEmailMessageRecipients('uno@test.com'), ['uno@test.com']);
assert.deepEqual(normalizeEmailMessageRecipients([' Uno@Test.com ', '', 'dos@test.com']), ['uno@test.com', 'dos@test.com']);
assert.deepEqual(normalizeEmailMessageRecipients(undefined), []);

const redacted = redactSensitiveEmailHtml('<a href="https://am.test/auth/callback?token_hash=abc&type=recovery">reset</a><a href="https://am.test/survey/token">survey</a>');
assert.match(redacted, /token_hash=\[redacted\]/);
assert.match(redacted, /type=recovery/);
assert.match(redacted, /\/survey\/token/);

assert.deepEqual(buildProviderStatus({
  resendApiKey: 're_123',
  resendFrom: 'AM Clinica <info@example.com>',
  brevoApiKey: '',
}), {
  activeProvider: 'resend',
  providers: [
    {
      key: 'resend',
      label: 'Resend',
      configured: true,
      mode: 'transaccional',
      from: 'AM Clinica <info@example.com>',
      notes: 'Proveedor activo para emails enviados desde la app.',
    },
    {
      key: 'brevo',
      label: 'Brevo',
      configured: false,
      mode: 'contactos',
      from: null,
      notes: 'Hoy esta previsto para sincronizacion/contactos; no es el sender transaccional activo.',
    },
  ],
});

console.log('email-message-tracking.spec.ts: ok');
