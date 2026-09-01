import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

// Presupuestos queda restringido a los perfiles administrativos.
const BUDGET_ROLES = new Set(['owner', 'admin', 'reception']);

export function canManagePresupuestos(role: string | null | undefined): boolean {
    return BUDGET_ROLES.has(normalizeCategoriaAlias(role || '') || '');
}
