export type PhotoTagCategory = 'rostro' | 'labios' | 'intraoral' | 'escaneado';

export interface PhotoTagSubcategory {
    key: string;
    label: string;
}

export interface PhotoTagCategoryDef {
    key: PhotoTagCategory;
    label: string;
    color: string;
    bgColor: string;
    subcategories: PhotoTagSubcategory[];
}

export const PHOTO_TAG_TAXONOMY: PhotoTagCategoryDef[] = [
    {
        key: 'rostro',
        label: 'Rostro',
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-100 dark:bg-blue-900/40',
        subcategories: [
            { key: 'frente',        label: 'Frente' },
            { key: 'perfil_izq',    label: 'Perfil izq.' },
            { key: 'perfil_der',    label: 'Perfil der.' },
            { key: 'tres_cuartos',  label: 'Tres cuartos' },
        ],
    },
    {
        key: 'labios',
        label: 'Labios',
        color: 'text-rose-700 dark:text-rose-300',
        bgColor: 'bg-rose-100 dark:bg-rose-900/40',
        subcategories: [
            { key: 'reposo',          label: 'Reposo' },
            { key: 'sonrisa',         label: 'Sonrisa' },
            { key: 'perfil_izq',      label: 'Perfil izq.' },
            { key: 'perfil_der',      label: 'Perfil der.' },
            { key: 'ambos_perfiles',  label: 'Ambos perfiles' },
        ],
    },
    {
        key: 'intraoral',
        label: 'Intraoral',
        color: 'text-emerald-700 dark:text-emerald-300',
        bgColor: 'bg-emerald-100 dark:bg-emerald-900/40',
        subcategories: [
            { key: 'frente',      label: 'Frente' },
            { key: 'perfil_izq',  label: 'Perfil izq.' },
            { key: 'perfil_der',  label: 'Perfil der.' },
            { key: 'oclusal_sup', label: 'Oclusal sup.' },
            { key: 'oclusal_inf', label: 'Oclusal inf.' },
            { key: 'mordida_izq', label: 'Mordida izq.' },
            { key: 'mordida_der', label: 'Mordida der.' },
        ],
    },
    {
        key: 'escaneado',
        label: 'Escaneado',
        color: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-100 dark:bg-amber-900/40',
        subcategories: [
            { key: 'inicial',      label: 'Inicial' },
            { key: 'seguimiento',  label: 'Seguimiento' },
            { key: 'final',        label: 'Final' },
        ],
    },
];

export function getCategoryDef(category: string): PhotoTagCategoryDef | undefined {
    return PHOTO_TAG_TAXONOMY.find(c => c.key === category);
}

export function getTagLabel(category: string, subcategory?: string | null): string {
    const cat = getCategoryDef(category);
    if (!cat) return category;
    if (!subcategory) return cat.label;
    const sub = cat.subcategories.find(s => s.key === subcategory);
    return sub ? `${cat.label} · ${sub.label}` : `${cat.label} · ${subcategory}`;
}
