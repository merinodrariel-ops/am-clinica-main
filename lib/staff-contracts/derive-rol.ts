import type { AnexoRol } from './types';

export function deriveAnexoRolClient(area: string, tipo: string): AnexoRol {
    const ar = (area || '').toLowerCase().trim();
    const t = (tipo || '').toLowerCase().trim();

    if (t === 'odontologo' || t === 'dentist' || ar.includes('odontolog')) return 'odontologo';
    if (t === 'laboratorio' || t === 'lab' || ar.includes('laborator')) return 'laboratorio';
    if (t === 'asistente' || t === 'assistant' || ar.includes('asistente')) return 'asistente';
    if (ar.includes('fideliz') || ar.includes('recaptacion')) return 'fidelizacion';
    if (ar.includes('marketing')) return 'marketing';
    return 'admin';
}
