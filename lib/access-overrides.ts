/**
 * Per-user module access overrides.
 * This is the single source of truth for module definitions and access-level logic.
 */

export type ModuleAccessLevel = 'inherit' | 'read' | 'edit' | 'none';
export type AccessOverrides = Partial<Record<string, ModuleAccessLevel>>;

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
    { key: 'email_templates',  label: 'Plantillas Email',      financial: false },
] as const;

export type ModuleKey = typeof MODULE_DEFINITIONS[number]['key'];

/**
 * Pure function: returns the default access for a given categoria + module key.
 * This mirrors (and centralizes) the logic from AuthContext.canEdit().
 */
export function getCategoryDefault(categoria: string, moduleKey: string): 'full' | 'none' {
    if (categoria === 'owner') return 'full';

    // Financial modules: only admin has full access by default
    if (['caja_recepcion', 'caja_admin', 'liquidaciones'].includes(moduleKey)) {
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
        // partner_viewer has no edit rights to anything
        if (categoria === 'partner_viewer') return 'none';
        return 'full';
    }

    // Portal: only professional roles
    if (moduleKey === 'portal') {
        return ['odontologo', 'asistente', 'laboratorio', 'admin'].includes(categoria) ? 'full' : 'none';
    }

    return 'none';
}
