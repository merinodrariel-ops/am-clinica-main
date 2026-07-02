export interface ActiveInstallmentPlan {
    cuotas_pagadas?: number | null;
    cuotas_total?: number | null;
    monto_cuota_usd?: number | null;
}

export interface ActiveInstallmentSuggestion {
    cuota_nro: number;
    cuotas_total: number;
    monto_cuota_usd: number;
}

export function buildActiveInstallmentSuggestion(
    plan: ActiveInstallmentPlan | null | undefined
): ActiveInstallmentSuggestion | null {
    if (!plan) return null;

    const cuotasPagadas = Number(plan.cuotas_pagadas || 0);
    const cuotasTotal = Number(plan.cuotas_total || 0);
    const cuotaNro = cuotasPagadas + 1;
    const montoCuotaUsd = Number(plan.monto_cuota_usd || 0);

    if (cuotasTotal <= 0 || cuotaNro > cuotasTotal || montoCuotaUsd <= 0) {
        return null;
    }

    return {
        cuota_nro: cuotaNro,
        cuotas_total: cuotasTotal,
        monto_cuota_usd: montoCuotaUsd,
    };
}
