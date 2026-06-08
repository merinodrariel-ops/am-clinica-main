import assert from 'node:assert/strict';
import { resolveRetentionRecallTemplates } from '../lib/retention-email-plans';

assert.deepEqual(resolveRetentionRecallTemplates('limpieza_convencional'), {
  primaryTemplate: 'recall_cleaning',
  secondaryTemplate: 'upgrade_cleaning_laser',
});

assert.deepEqual(resolveRetentionRecallTemplates('control_carilla_anual'), {
  primaryTemplate: 'recall_veneer_control',
  secondaryTemplate: 'cross_sell_cleaning_after_veneers',
});

assert.deepEqual(resolveRetentionRecallTemplates('blanqueamiento'), {
  primaryTemplate: 'recall_whitening',
});

assert.deepEqual(resolveRetentionRecallTemplates('control_ortodoncia'), {
  primaryTemplate: 'recall_orthodontic_control',
});

assert.deepEqual(resolveRetentionRecallTemplates('otra_cosa'), {
  primaryTemplate: 'recall_6_months',
});

console.log('retention-email-plans.spec.ts: ok');
