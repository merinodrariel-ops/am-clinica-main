export type SmileShade =
  | 'Original mejorado'
  | 'Natural'
  | 'Blanco estético'
  | 'Ultra blanco';

export type SmileIdentity = 'Fiel' | 'Equilibrado' | 'Idealizado';

export type SmileIntensity3 = 'Sutil' | 'Medio' | 'Marcado';
export type CentralLength = 'Cortos' | 'Natural' | 'Largos';

export interface SmileSettings {
  level: SmileShade;
  identity: SmileIdentity;
  edges: boolean;
  edgesIntensity: SmileIntensity3;
  texture: boolean;
  textureIntensity: 'Sutil' | 'Medio' | 'Detallado';
  shape: number;
  centralLength: CentralLength;
}

export const DEFAULT_SMILE_SETTINGS: SmileSettings = {
  level: 'Natural',
  identity: 'Equilibrado',
  edges: true,
  edgesIntensity: 'Medio',
  texture: true,
  textureIntensity: 'Medio',
  shape: 0,
  centralLength: 'Natural',
};

const SHADE_ORDER: SmileShade[] = [
  'Original mejorado',
  'Natural',
  'Blanco estético',
  'Ultra blanco',
];

const IDENTITY_ORDER: SmileIdentity[] = ['Fiel', 'Equilibrado', 'Idealizado'];

function previousValue<T>(values: T[], current: T): T {
  const index = values.indexOf(current);
  return values[Math.max(0, index - 1)] ?? current;
}

function nextValue<T>(values: T[], current: T): T {
  const index = values.indexOf(current);
  return values[Math.min(values.length - 1, Math.max(0, index) + 1)] ?? current;
}

export function getMoreNaturalSettings(settings: SmileSettings): SmileSettings {
  return {
    ...settings,
    identity: previousValue(IDENTITY_ORDER, settings.identity),
    level: previousValue(SHADE_ORDER, settings.level),
  };
}

export function getMorePerfectSettings(settings: SmileSettings): SmileSettings {
  return {
    ...settings,
    identity: nextValue(IDENTITY_ORDER, settings.identity),
  };
}

export function getLessWhiteSettings(settings: SmileSettings): SmileSettings {
  return {
    ...settings,
    level: previousValue(SHADE_ORDER, settings.level),
  };
}
