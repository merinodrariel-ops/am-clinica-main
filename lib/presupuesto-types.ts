export type PresupuestoAlternative = {
    title: string;
    description: string;
    total: number;
    currency: 'USD' | 'ARS';
};

export const MAX_PRESUPUESTO_ALTERNATIVES = 10;

export type PresupuestoPayload = {
    patientName: string;
    intro: string;
    alternatives: PresupuestoAlternative[];
    financing: string;
    guarantee: string;
    conditions: string;
    cta: string;
    photoUrls: string[];
    /** Slugs de los casos publicados que se adjuntan como prueba (máximo 2). */
    caseSlugs?: string[];
    /** Anticipo con el que se arma la tabla de cuotas. Sólo 30 o 50, igual que el sitio. */
    financingUpfrontPct?: 30 | 50;
    /** Alternativa sobre la que se calcula la financiación. */
    financingBaseIndex?: number;
    /** Si es false, la propuesta no incluye la sección de financiación. */
    financingEnabled?: boolean;
};

export type PresupuestoRecord = {
    id: string;
    paciente_id: string;
    status: string;
    valid_days: number;
    issued_at: string;
    expires_at: string;
    payload: PresupuestoPayload;
    version: number;
};
