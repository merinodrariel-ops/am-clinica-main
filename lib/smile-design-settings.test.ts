import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SMILE_SETTINGS,
  getLessWhiteSettings,
  getMoreNaturalSettings,
  getMorePerfectSettings,
} from './smile-design-settings';
import { buildSmileDesignPrompt } from './smile-design-prompt';

test('defaults to an equilibrated identity with a minimally improved original shade', () => {
  assert.equal(DEFAULT_SMILE_SETTINGS.identity, 'Equilibrado');
  assert.equal(DEFAULT_SMILE_SETTINGS.level, 'Original mejorado');
  assert.equal(DEFAULT_SMILE_SETTINGS.expression, 'Sonrisa suave');
});

test('soft smile relaxes only the lower facial expression without forcing a grin', () => {
  const prompt = buildSmileDesignPrompt(DEFAULT_SMILE_SETTINGS);

  assert.match(prompt, /EXPRESIÓN NATURAL AM/);
  assert.match(prompt, /eleva de manera mínima.*las comisuras/i);
  assert.match(prompt, /tejidos blandos periorales del tercio inferior/i);
  assert.match(prompt, /No generes una carcajada, sonrisa forzada/i);
  assert.match(prompt, /No alteres.*nariz, ojos/i);
  assert.doesNotMatch(prompt, /Modifica únicamente los dientes visibles/);
});

test('original expression keeps lips and facial soft tissues unchanged', () => {
  const prompt = buildSmileDesignPrompt({
    ...DEFAULT_SMILE_SETTINGS,
    expression: 'Original',
  });

  assert.match(prompt, /EXPRESIÓN ORIGINAL/);
  assert.match(prompt, /Conserva exactamente la expresión/i);
  assert.match(prompt, /Modifica únicamente los dientes visibles/);
  assert.match(prompt, /No alteres labios/i);
});

test('quick actions move identity and shade independently', () => {
  const moreNatural = getMoreNaturalSettings(DEFAULT_SMILE_SETTINGS);
  assert.equal(moreNatural.identity, 'Fiel');
  assert.equal(moreNatural.level, 'Tono original');

  const morePerfect = getMorePerfectSettings(DEFAULT_SMILE_SETTINGS);
  assert.equal(morePerfect.identity, 'Idealizado');
  assert.equal(morePerfect.level, 'Original mejorado');

  const lessWhite = getLessWhiteSettings(DEFAULT_SMILE_SETTINGS);
  assert.equal(lessWhite.identity, 'Equilibrado');
  assert.equal(lessWhite.level, 'Tono original');
});

test('original shade forbids whitening and applies consistently across photo angles', () => {
  const prompt = buildSmileDesignPrompt({
    ...DEFAULT_SMILE_SETTINGS,
    level: 'Tono original',
  });

  assert.match(prompt, /CERO BLANQUEAMIENTO/);
  assert.match(prompt, /fotografías frontales, laterales y de tres cuartos/i);
  assert.match(prompt, /no autoriza a blanquear más/i);
  assert.match(prompt, /zonas de esmalte original sin reflejo especular/i);
});

test('faithful natural prompt preserves dimensions and avoids flat white', () => {
  const prompt = buildSmileDesignPrompt({
    ...DEFAULT_SMILE_SETTINGS,
    identity: 'Fiel',
    level: 'Original mejorado',
  });

  assert.match(prompt, /80-90% de la identidad dental/);
  assert.match(prompt, /no agrandes los dientes/i);
  assert.match(prompt, /Evita blanco puro uniforme/i);
  assert.doesNotMatch(prompt, /Hollywood/i);
});

test('idealized prompt allows stronger correction without oversized teeth', () => {
  const prompt = buildSmileDesignPrompt({
    ...DEFAULT_SMILE_SETTINGS,
    identity: 'Idealizado',
    level: 'Blanco estético',
  });

  assert.match(prompt, /corrección más marcada/i);
  assert.match(prompt, /evita dientes sobredimensionados/i);
  assert.match(prompt, /blanco estético moderado/i);
});
