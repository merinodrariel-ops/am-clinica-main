import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

const BUDGET_ROLES = new Set(['owner', 'admin', 'reception']);

export function canManagePresupuestos(role: string | null | undefined): boolean {
    return BUDGET_ROLES.has(normalizeCategoriaAlias(role || '') || '');
}
