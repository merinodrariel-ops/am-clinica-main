import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

// Presupuestos es una capacidad operativa sobre la ficha del paciente.
// Asistentes ya tienen acceso a pacientes/turnos y necesitan poder llevar
// las fotos seleccionadas hasta la propuesta comercial.
const BUDGET_ROLES = new Set(['owner', 'admin', 'reception', 'asistente']);

export function canManagePresupuestos(role: string | null | undefined): boolean {
    return BUDGET_ROLES.has(normalizeCategoriaAlias(role || '') || '');
}
