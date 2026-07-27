import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SMILE_SETTINGS,
  getLessWhiteSettings,
  getMoreNaturalSettings,
  getMorePerfectSettings,
} from './smile-design-settings';
import { buildSmileDesignPrompt } from './smile-design-prompt';

test('defaults to an equilibrated identity with a natural shade', () => {
  assert.equal(DEFAULT_SMILE_SETTINGS.identity, 'Equilibrado');
  assert.equal(DEFAULT_SMILE_SETTINGS.level, 'Natural');
});

test('quick actions move identity and shade independently', () => {
  const moreNatural = getMoreNaturalSettings(DEFAULT_SMILE_SETTINGS);
  assert.equal(moreNatural.identity, 'Fiel');
  assert.equal(moreNatural.level, 'Original mejorado');

  const morePerfect = getMorePerfectSettings(DEFAULT_SMILE_SETTINGS);
  assert.equal(morePerfect.identity, 'Idealizado');
  assert.equal(morePerfect.level, 'Natural');

  const lessWhite = getLessWhiteSettings(DEFAULT_SMILE_SETTINGS);
  assert.equal(lessWhite.identity, 'Equilibrado');
  assert.equal(lessWhite.level, 'Original mejorado');
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
