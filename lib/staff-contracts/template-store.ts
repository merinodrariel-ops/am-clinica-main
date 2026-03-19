import type { StoredTemplates, MasterClause, AnexoBNorma } from './templates-default';
import {
    DEFAULT_MASTER_CLAUSES,
    DEFAULT_MASTER_INTRO,
    DEFAULT_ANEXOB_NORMAS,
    DEFAULT_RECIBO_TEMPLATE,
} from './templates-default';
import { ANEXO_A_MAP } from './anexo-a';
import type { AnexoRol } from './types';

const STORAGE_KEY = 'am_contract_templates_v1';

export function loadStoredTemplates(): StoredTemplates {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StoredTemplates) : {};
    } catch {
        return {};
    }
}

export function saveStoredTemplates(t: StoredTemplates): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

export function resetStoredTemplates(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
}

// ─── Resolved accessors (merge stored with defaults) ────────────────────────

export function getMasterIntro(stored?: StoredTemplates): string {
    return stored?.master_intro ?? DEFAULT_MASTER_INTRO;
}

export function getMasterClauses(stored?: StoredTemplates): MasterClause[] {
    return stored?.master_clauses ?? DEFAULT_MASTER_CLAUSES;
}

export function getAnexoA(rol: AnexoRol, stored?: StoredTemplates): { titulo: string; funciones: string } {
    return stored?.anexo_a?.[rol] ?? ANEXO_A_MAP[rol];
}

export function getAnexoBNormas(stored?: StoredTemplates): AnexoBNorma[] {
    return stored?.anexo_b_normas ?? DEFAULT_ANEXOB_NORMAS;
}

export function getReciboTemplate(stored?: StoredTemplates): string {
    return stored?.recibo ?? DEFAULT_RECIBO_TEMPLATE;
}

// ─── Full contract text assembly (for preview + Word export) ─────────────────

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export interface ContractTextParams {
    nombre: string;
    apellido: string;
    dni: string;
    domicilio: string;
    fecha: Date;
    anexoRol: AnexoRol;
    templates?: StoredTemplates;
}

export function assembleContractFullText(p: ContractTextParams): string {
    const nombreCompleto = `${p.nombre} ${p.apellido}`.trim();
    const dia = String(p.fecha.getDate()).padStart(2, '0');
    const mes = MESES[p.fecha.getMonth()];
    const anio = String(p.fecha.getFullYear());
    const t = p.templates;

    const clauses = getMasterClauses(t);
    const anexoA = getAnexoA(p.anexoRol, t);
    const normas = getAnexoBNormas(t);

    const sigBlock = `
Firmado en la Ciudad Autónoma de Buenos Aires, a los ${dia} días del mes de ${mes} de ${anio}.

POR FULL ESTHETIC S.A.                          POR EL/LA LOCADOR/A
Dr. Ariel Merino                                ${nombreCompleto}
DNI: 33.447.153                                 DNI: ${p.dni}
`;

    // ── CONTRATO MAESTRO ──────────────────────────────────────────────
    let text = `AM
CONTRATO DE LOCACIÓN DE SERVICIOS INDEPENDIENTES
════════════════════════════════════════════════

ENTRE:

FULL ESTHETIC S.A., CUIT N° 30-71774841-2, con domicilio en Camila O'Gorman 412, Piso 1, Oficina 101, Ciudad Autónoma de Buenos Aires, en adelante "LA CONTRATANTE", representada en este acto por su Director, Dr. Ariel Merino, DNI 33.447.153, por una parte;

Y

${nombreCompleto}, DNI N° ${p.dni}, con domicilio en ${p.domicilio}, en adelante "EL/LA LOCADOR/A", por la otra;

se acuerda celebrar el presente CONTRATO DE LOCACIÓN DE SERVICIOS INDEPENDIENTES, sujeto a las siguientes cláusulas:

`;

    for (const cl of clauses) {
        text += `${cl.heading}\n${cl.body}\n\n`;
    }

    text += sigBlock;

    // ── ANEXO A ──────────────────────────────────────────────────────
    text += `
════════════════════════════════════════════════
AM
ANEXO A — DESCRIPCIÓN DE FUNCIONES
Rol: ${anexoA.titulo}
════════════════════════════════════════════════

Partes: FULL ESTHETIC S.A. (LA CONTRATANTE) y ${nombreCompleto}, DNI N° ${p.dni} (EL/LA LOCADOR/A).

FUNCIONES Y TAREAS ENCOMENDADAS

${anexoA.funciones}

`;
    text += sigBlock;

    // ── ANEXO B ──────────────────────────────────────────────────────
    text += `
════════════════════════════════════════════════
AM
ANEXO B — NORMAS DE CONVIVENCIA GENERAL
AM Estética Dental — FULL ESTHETIC S.A.
════════════════════════════════════════════════

El presente Anexo establece las normas de conducta y convivencia aplicables a todas las personas que presten servicios en el ámbito de AM Estética Dental, con independencia de la naturaleza jurídica del vínculo que las una con LA CONTRATANTE. Estas normas forman parte integrante del contrato y su incumplimiento podrá dar lugar a las consecuencias previstas en el mismo.

`;

    for (const n of normas) {
        text += `${n.num} ${n.titulo}\n${n.texto}\n\n`;
    }

    text += `Habiendo tomado conocimiento y comprendido el alcance del presente Anexo B, EL/LA LOCADOR/A manifiesta su conformidad y compromiso de cumplimiento con la firma a continuación:\n`;
    text += sigBlock;

    return text;
}
