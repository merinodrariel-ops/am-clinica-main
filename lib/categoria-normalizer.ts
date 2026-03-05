export function normalizeCategoriaAlias(value?: string | null): string | null {
    if (!value) return null;

    const raw = value.trim();
    if (!raw) return null;

    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (
        normalized === 'administradora'
        || normalized === 'administrador'
        || normalized === 'administracion'
        || normalized.startsWith('admin')
    ) {
        return 'admin';
    }

    return normalized;
}
