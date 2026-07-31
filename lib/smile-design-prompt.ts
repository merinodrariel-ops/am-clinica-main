import type { SmileSettings } from './smile-design-settings';

const SHADE_PROMPTS: Record<SmileSettings['level'], string> = {
  'Tono original': [
    'CERO BLANQUEAMIENTO: copia el tono, valor, saturación y calidez de los dientes originales visibles en esta misma foto.',
    'La mejora debe ser únicamente de forma, alineación y textura; no aclares el cuerpo dental ni neutralices amarillos o marfiles naturales.',
    'Usa como referencia cromática las zonas de esmalte original sin reflejo especular, especialmente el tercio medio y cervical.',
  ].join(' '),
  'Original mejorado': [
    'Conserva el tono base, la calidez y el carácter cromático de los dientes originales.',
    'Mejora como máximo medio tono, de forma apenas perceptible, sin neutralizar el marfil natural.',
    'El resultado debe seguir leyéndose como el esmalte propio del paciente, no como un blanqueamiento ni como carillas blancas.',
  ].join(' '),
  Natural: [
    'Usa un marfil natural luminoso, como máximo aproximadamente un tono más claro que el original y nunca blanco puro.',
    'Conserva calidez cervical y adapta el color a la temperatura de luz real de la escena.',
  ].join(' '),
  'Blanco estético': [
    'Aplica un blanco estético moderado, todavía integrado con la piel y la iluminación.',
    'Conserva gradiente cálido cervical, volumen y translucidez incisal.',
  ].join(' '),
  'Ultra blanco': [
    'Aplica un blanco brillante de alto impacto sin quemar luces ni convertir el esmalte en una superficie plana.',
    'Incluso en este nivel conserva gradientes, sombras interdentales y translucidez.',
  ].join(' '),
};

const IDENTITY_PROMPTS: Record<SmileSettings['identity'], string> = {
  Fiel: [
    'IDENTIDAD FIEL: conserva aproximadamente 80-90% de la identidad dental del paciente.',
    'Mantén el ancho, largo, volumen, arco, línea incisal, proporciones y pequeñas asimetrías características.',
    'Corrige solo desalineaciones leves o bordes dañados; no agrandes los dientes ni fabriques una dentadura genérica.',
    'No cierres espacios si para hacerlo debes ensanchar o aumentar las piezas.',
  ].join(' '),
  Equilibrado: [
    'IDENTIDAD EQUILIBRADA: crea un híbrido entre los dientes reales del paciente y una sonrisa armónica.',
    'Conserva el tamaño global, la arquitectura y los rasgos reconocibles, con corrección moderada de alineación y forma.',
    'Mejora proporciones sin volver todos los dientes idénticos, excesivamente grandes o perfectamente simétricos.',
    'Puedes reducir espacios pequeños solo si el resultado mantiene dimensiones naturales.',
  ].join(' '),
  Idealizado: [
    'IDENTIDAD IDEALIZADA: permite una corrección más marcada de alineación, simetría y proporciones, como una rehabilitación estética.',
    'Cierra espacios y armoniza formas, pero evita dientes sobredimensionados, bloques uniformes o apariencia de prótesis digital.',
  ].join(' '),
};

const EDGES_PROMPTS: Record<SmileSettings['edgesIntensity'], string> = {
  Sutil: 'Mantén una translucidez incisal apenas perceptible.',
  Medio: 'Mantén translucidez incisal natural típica de dientes adultos sanos.',
  Marcado: 'Mantén translucidez incisal visible pero realista en los bordes de corte.',
};

const TEXTURE_PROMPTS: Record<SmileSettings['textureIntensity'], string> = {
  Sutil: 'Conserva una microtextura superficial natural y sutil.',
  Medio: 'Conserva microtextura natural con periquimatías suaves y reflejos no uniformes.',
  Detallado: 'Conserva textura realista, lóbulos sutiles y variación fina del esmalte.',
};

export function buildSmileDesignPrompt(settings: SmileSettings): string {
  const anatomyLines: string[] = [];

  if (settings.edges) anatomyLines.push(EDGES_PROMPTS[settings.edgesIntensity]);
  if (settings.texture) anatomyLines.push(TEXTURE_PROMPTS[settings.textureIntensity]);

  if (settings.centralLength === 'Cortos') {
    anatomyLines.push('Acorta levemente los incisivos centrales, sin alterar el ancho global de la sonrisa.');
  } else if (settings.centralLength === 'Largos') {
    anatomyLines.push('Alarga levemente los incisivos centrales, manteniendo una proporción adulta y natural.');
  }

  if (Math.abs(settings.shape) > 0.1) {
    anatomyLines.push(
      settings.shape < 0
        ? 'Suaviza levemente los ángulos distoincisales y las troneras, sin uniformar las piezas.'
        : 'Aplana levemente los bordes incisales y marca ángulos más rectos, sin uniformar las piezas.'
    );
  }

  return `Realiza una simulación estética fotorrealista de la sonrisa de esta persona.

PRIORIDAD 1 — IDENTIDAD Y GEOMETRÍA:
${IDENTITY_PROMPTS[settings.identity]}

PRIORIDAD 2 — COLOR DEL ESMALTE:
${SHADE_PROMPTS[settings.level]}

CONSISTENCIA ENTRE ÁNGULOS:
- Aplica exactamente la misma escala cromática en fotografías frontales, laterales y de tres cuartos.
- Una toma frontal o una sonrisa más expuesta no autoriza a blanquear más los dientes.
- Distingue el color real del esmalte de reflejos frontales, flash, exposición y balance de blancos de la fotografía.

REALISMO ÓPTICO OBLIGATORIO:
- Respeta la dirección, intensidad y temperatura de la iluminación original.
- Evita blanco puro uniforme: los reflejos pueden ser claros, pero no todo el cuerpo dental.
- No eleves la exposición, los blancos ni las altas luces de la zona dental para simular un tono más claro.
- Conserva una zona cervical algo más cálida, cuerpo marfil, bordes incisales translúcidos y sombras interdentales.
- Cada pieza debe conservar volumen propio; evita una franja blanca plana o aspecto de carillas pegadas.
- Mantén textura del esmalte y variaciones suaves de luminosidad.

AJUSTES FINOS:
${anatomyLines.length > 0 ? anatomyLines.map(line => `- ${line}`).join('\n') : '- Sin ajustes adicionales.'}

PRESERVACIÓN:
- Modifica únicamente los dientes visibles.
- No alteres labios, encía, nariz, ojos, piel, forma facial, cabello, fondo, encuadre ni exposición general.
- No agregues ni elimines dientes visibles.
- Devuelve solo la imagen final editada.`;
}
