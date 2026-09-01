/**
 * Per-user module access overrides.
 * This is the single source of truth for module definitions and access-level logic.
 */

export type ModuleAccessLevel = 'inherit' | 'read' | 'edit' | 'none';
export type AccessOverrides = Partial<Record<string, ModuleAccessLevel>>;

export type ActiveAccessGrant = {
    module_key: string;
    access_level: 'read' | 'edit';
    starts_at?: string | null;
    expires_at?: string | null;
};

export const MODULE_DEFINITIONS = [
    { key: 'agenda',           label: 'Agenda',                financial: false },
    { key: 'patients',         label: 'Pacientes',             financial: false },
    { key: 'caja_recepcion',   label: 'Caja Recepción',        financial: true  },
    { key: 'caja_admin',       label: 'Caja Administración',   financial: true  },
    { key: 'inventario',       label: 'Inventario',            financial: false },
    { key: 'workflows',        label: 'Workflows',             financial: false },
    { key: 'recalls',          label: 'Recall Engine',         financial: false },
    { key: 'todos',            label: 'Tareas',                financial: false },
    { key: 'portal',           label: 'Mi Portal (Prestador)', financial: false },
    { key: 'staff',            label: 'Gestión de Staff',      financial: false },
    { key: 'liquidaciones',    label: 'Liquidaciones',         financial: true  },
    { key: 'email_templates',  label: 'Emails',                financial: false },
] as const;

export type ModuleKey = typeof MODULE_DEFINITIONS[number]['key'];

/**
 * Pure function: returns the default access for a given categoria + module key.
 * This mirrors (and centralizes) the logic from AuthContext.canEdit().
 */
export function getCategoryDefault(categoria: string, moduleKey: string): 'full' | 'read' | 'none' {
    if (categoria === 'owner') return 'full';

    // Financial modules: only admin has full access by default, reception gets full access to caja_recepcion
    if (moduleKey === 'caja_recepcion') {
        return ['admin', 'reception'].includes(categoria) ? 'full' : 'none';
    }
    if (['caja_admin', 'liquidaciones'].includes(moduleKey)) {
        return categoria === 'admin' ? 'full' : 'none';
    }

    // Staff / admin-only modules
    if (moduleKey === 'staff') {
        return ['admin', 'developer'].includes(categoria) ? 'full' : 'none';
    }
    if (moduleKey === 'email_templates') {
        return ['admin', 'developer'].includes(categoria) ? 'full' : 'none';
    }

    // Operational modules — most roles have access
    const OPERATIONAL = ['agenda', 'patients', 'todos', 'recalls', 'inventario', 'workflows'];
    if (OPERATIONAL.includes(moduleKey)) {
        if (categoria === 'marketing') return moduleKey === 'patients' ? 'read' : 'none';
        // partner_viewer has visibility, but no edit rights by default
        if (categoria === 'partner_viewer') return 'read';
        return 'full';
    }

    // Portal: only professional roles
    if (moduleKey === 'portal') {
        return ['odontologo', 'asistente', 'laboratorio', 'admin'].includes(categoria) ? 'full' : 'none';
    }

    return 'none';
}

/**
 * Resolves the effective access used by the UI.
 * Explicit per-user overrides remain authoritative; temporary grants only
 * elevate inherited access and automatically expire by timestamp.
 */
export function resolveModuleAccess(
    categoria: string,
    moduleKey: string,
    overrides: AccessOverrides | null | undefined,
    grants: ActiveAccessGrant[] = [],
    now = new Date(),
): 'full' | 'read' | 'none' {
    const override = overrides?.[moduleKey];
    if (override === 'none') return 'none';
    if (override === 'edit') return 'full';
    if (override === 'read') return 'read';

    const inherited = getCategoryDefault(categoria || 'partner_viewer', moduleKey);
    const activeGrant = grants
        .filter(grant => grant.module_key === moduleKey)
        .filter(grant => !grant.starts_at || new Date(grant.starts_at) <= now)
        .filter(grant => !grant.expires_at || new Date(grant.expires_at) > now)
        .sort((left, right) => (left.access_level === 'edit' ? 1 : 0) - (right.access_level === 'edit' ? 1 : 0))
        .at(-1);

    if (!activeGrant) return inherited;
    if (activeGrant.access_level === 'edit') return 'full';
    return inherited === 'full' ? 'full' : 'read';
}
