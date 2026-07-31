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
