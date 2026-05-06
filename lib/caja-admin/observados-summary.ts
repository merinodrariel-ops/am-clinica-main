type PersonalRef = {
    nombre?: string | null;
    apellido?: string | null;
};

export type ObservadoLeaderRow = {
    personal_id: string;
    created_at?: string | null;
    fecha: string;
    personal?: PersonalRef | PersonalRef[] | null;
};

export type ObservadoCriticalLeader = {
    personal_id: string;
    nombre: string;
    apellido: string;
    critical_count: number;
};

export function summarizeCriticalObservedLeaders(
    rows: ObservadoLeaderRow[],
    options: { nowMs?: number; limit?: number } = {}
): ObservadoCriticalLeader[] {
    const criticalThreshold = (options.nowMs ?? Date.now()) - 48 * 60 * 60 * 1000;
    const grouped = new Map<string, ObservadoCriticalLeader>();

    rows.forEach((row) => {
        const parsed = new Date(row.created_at || row.fecha);
        const createdAtMs = Number.isNaN(parsed.getTime())
            ? new Date(`${row.fecha}T00:00:00`).getTime()
            : parsed.getTime();

        if (createdAtMs > criticalThreshold) return;

        const person = Array.isArray(row.personal) ? row.personal[0] : row.personal;
        const current = grouped.get(row.personal_id);
        if (current) {
            current.critical_count += 1;
            return;
        }

        grouped.set(row.personal_id, {
            personal_id: row.personal_id,
            nombre: person?.nombre || 'Sin nombre',
            apellido: person?.apellido || '',
            critical_count: 1,
        });
    });

    return Array.from(grouped.values())
        .sort((a, b) => b.critical_count - a.critical_count)
        .slice(0, Math.max(1, options.limit ?? 3));
}
