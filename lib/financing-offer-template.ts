import {
    calculateFinancingBreakdown,
    DEFAULT_MONTHLY_INTEREST_PCT,
    formatArs,
    formatUsd,
} from '@/lib/financial-engine';

export interface FinancingOfferHtmlInput {
    treatment: string;
    totalUsd: number;
    installments: number;
    bnaVentaArs: number;
}

function escapeHtml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function optionCard(label: string, upfrontPct: number, quote: ReturnType<typeof calculateFinancingBreakdown>): string {
    return `<div style="flex:1;min-width:240px;border:1px solid #d8e2f0;border-radius:16px;padding:16px;background:#ffffff;">
  <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#4b5b70;">${label}</p>
  <p style="margin:0;font-size:28px;font-weight:700;color:#0f172a;">${formatUsd(quote.installmentUsd)}</p>
  <p style="margin:4px 0 0 0;font-size:13px;color:#475569;">(${formatArs(quote.installmentArs)} al TC BNA del dia)</p>

  <div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:13px;color:#334155;line-height:1.5;">
    <div style="display:flex;justify-content:space-between;"><span>Anticipo ${upfrontPct}%</span><strong>${formatUsd(quote.upfrontUsd)}</strong></div>
    <div style="display:flex;justify-content:space-between;"><span>Saldo financiado</span><strong>${formatUsd(quote.financedPrincipalUsd)}</strong></div>
    <div style="display:flex;justify-content:space-between;"><span>Plan</span><strong>${quote.installments} cuotas</strong></div>
  </div>
</div>`;
}

export function buildFinancingOfferHtml(input: FinancingOfferHtmlInput): string {
    const treatment = escapeHtml(input.treatment || 'Tratamiento odontologico');
    const installments = [3, 6, 12].includes(Math.floor(input.installments || 0))
        ? Math.floor(input.installments)
        : 12;

    const option30 = calculateFinancingBreakdown({
        totalUsd: input.totalUsd,
        upfrontPct: 30,
        installments,
        monthlyInterestPct: DEFAULT_MONTHLY_INTEREST_PCT,
        bnaVentaArs: input.bnaVentaArs,
    });

    const option50 = calculateFinancingBreakdown({
        totalUsd: input.totalUsd,
        upfrontPct: 50,
        installments,
        monthlyInterestPct: DEFAULT_MONTHLY_INTEREST_PCT,
        bnaVentaArs: input.bnaVentaArs,
    });

    return `<section style="font-family:Inter,Segoe UI,Arial,sans-serif;background:linear-gradient(145deg,#f8fbff,#eef5ff);border:1px solid #d9e6fb;border-radius:20px;padding:22px;max-width:880px;">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
    <div>
      <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#3b82f6;">AM CLINICA DENTAL · OPCIONES DE FINANCIACION</p>
      <h3 style="margin:8px 0 4px 0;font-size:22px;color:#0f172a;">${treatment}</h3>
      <p style="margin:0;font-size:14px;color:#475569;">Monto total: <strong>${formatUsd(input.totalUsd)}</strong> · Referencia ARS: <strong>${formatArs(option30.totalArs)}</strong></p>
    </div>
    <div style="background:#0f172a;color:#e2e8f0;border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.45;">
      <div>TNA: 18% anual sobre saldo financiado</div>
      <div>Tasa mensual: ${DEFAULT_MONTHLY_INTEREST_PCT.toFixed(2)}%</div>
      <div>TC referencia: BNA Venta ${formatArs(input.bnaVentaArs)}</div>
      <div>Punitorio: 3.00% diario por mora</div>
    </div>
  </div>

  <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
    ${optionCard('Opcion sugerida', 30, option30)}
    ${optionCard('Opcion premium', 50, option50)}
  </div>

  <p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">
    Importes en ARS sujetos al tipo de cambio vendedor BNA vigente al dia de pago. Financiacion sujeta a evaluacion y preaprobacion de cada caso.
  </p>
</section>`;
}
