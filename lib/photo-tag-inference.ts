import { PHOTO_TAG_TAXONOMY, type PhotoTagCategory } from './photo-tag-taxonomy';

export interface InferredPhotoTag {
    category: PhotoTagCategory;
    subcategory: string | null;
}

function normalize(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasAny(text: string, terms: string[]) {
    return terms.some(term => text.includes(term));
}

function validSubcategory(category: PhotoTagCategory, subcategory: string | null) {
    if (!subcategory) return null;
    const categoryDef = PHOTO_TAG_TAXONOMY.find(item => item.key === category);
    return categoryDef?.subcategories.some(item => item.key === subcategory) ? subcategory : null;
}

export function inferPhotoTagFromDescription(description: string): InferredPhotoTag | null {
    const text = normalize(description);
    if (!text) return null;

    let category: PhotoTagCategory = 'rostro';
    if (hasAny(text, ['intraoral', 'intra oral', 'boca', 'diente', 'dientes', 'mordida', 'oclusal', 'arcada', 'paladar', 'lingual'])) {
        category = 'intraoral';
    } else if (hasAny(text, ['labio', 'labios', 'sonrisa', 'sonriendo', 'reposo labial', 'perfil labial'])) {
        category = 'labios';
    } else if (hasAny(text, ['escaneo', 'escaneado', 'scan', 'stl', 'modelo', 'impresion', 'exocad'])) {
        category = 'escaneado';
    } else if (hasAny(text, ['rostro', 'cara', 'facial', 'frente', 'perfil', 'extraoral', 'extra oral', 'tres cuartos'])) {
        category = 'rostro';
    }

    let subcategory: string | null = null;
    const mentionsLeft = hasAny(text, ['izq', 'izquierdo', 'izquierda']);
    const mentionsRight = hasAny(text, ['der', 'derecho', 'derecha']);
    const mentionsBoth = hasAny(text, ['ambos', 'bilateral', 'dos perfiles']);

    if (category === 'intraoral') {
        if (hasAny(text, ['oclusal superior', 'oclusal sup', 'arcada superior', 'maxilar superior', 'arriba', 'superior'])) {
            subcategory = 'oclusal_sup';
        } else if (hasAny(text, ['oclusal inferior', 'oclusal inf', 'arcada inferior', 'maxilar inferior', 'abajo', 'inferior'])) {
            subcategory = 'oclusal_inf';
        } else if (hasAny(text, ['mordida']) && mentionsLeft) {
            subcategory = 'mordida_izq';
        } else if (hasAny(text, ['mordida']) && mentionsRight) {
            subcategory = 'mordida_der';
        } else if (mentionsLeft) {
            subcategory = 'perfil_izq';
        } else if (mentionsRight) {
            subcategory = 'perfil_der';
        } else if (hasAny(text, ['frente', 'frontal', 'anterior'])) {
            subcategory = 'frente';
        }
    } else if (category === 'labios') {
        if (mentionsBoth) {
            subcategory = 'ambos_perfiles';
        } else if (mentionsLeft) {
            subcategory = 'perfil_izq';
        } else if (mentionsRight) {
            subcategory = 'perfil_der';
        } else if (hasAny(text, ['reposo', 'relajado', 'sin sonrisa'])) {
            subcategory = 'reposo';
        } else if (hasAny(text, ['sonrisa', 'sonriendo'])) {
            subcategory = 'sonrisa';
        }
    } else if (category === 'rostro') {
        if (hasAny(text, ['tres cuartos', '3 4', '45 grados', 'oblicua', 'oblicuo'])) {
            subcategory = 'tres_cuartos';
        } else if (mentionsLeft) {
            subcategory = 'perfil_izq';
        } else if (mentionsRight) {
            subcategory = 'perfil_der';
        } else if (hasAny(text, ['frente', 'frontal', 'cara completa', 'rostro completo'])) {
            subcategory = 'frente';
        }
    } else if (category === 'escaneado') {
        if (hasAny(text, ['final', 'terminado', 'post'])) {
            subcategory = 'final';
        } else if (hasAny(text, ['seguimiento', 'control', 'intermedio'])) {
            subcategory = 'seguimiento';
        } else if (hasAny(text, ['inicial', 'pre', 'inicio'])) {
            subcategory = 'inicial';
        }
    }

    return {
        category,
        subcategory: validSubcategory(category, subcategory),
    };
}
