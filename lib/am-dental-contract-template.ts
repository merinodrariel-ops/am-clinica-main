import { formatArs, formatUsd } from '@/lib/financial-engine';

export interface ContractTemplateData {
    fechaContrato: string;
    pacienteNombreCompleto: string;
    pacienteDocumento: string;
    pacienteDomicilio: string;
    pacienteEmail: string;
    tratamiento: string;
    montoTotalUsd: number;
    montoTotalArs: number;
    anticipoPct: number;
    anticipoUsd: number;
    anticipoArs: number;
    saldoFinanciadoUsd: number;
    saldoFinanciadoArs: number;
    cuotas: number;
    cuotaUsd: number;
    cuotaArs: number;
    interesMensualPct: number;
    punitorioDiarioPct: number;
    punitorioDiarioCuotaUsd: number;
    punitorioDiarioCuotaArs: number;
    bnaVenta: number;
    fechaPrimeraCuota: string;
}

export const AM_DENTAL_CONTRACT_TEMPLATE = `# ACUERDO DE PRESTACION Y FINANCIACION ODONTOLOGICA

**AM DENTAL (Fullsthetic S.A.)**

En la fecha **{{FECHA_CONTRATO}}**, entre **AM DENTAL (Fullsthetic S.A.)**, representada por el Dr. Ariel Merino, y el/la paciente **{{PACIENTE_NOMBRE}}**, DNI **{{PACIENTE_DOCUMENTO}}**, domicilio **{{PACIENTE_DOMICILIO}}**, correo **{{PACIENTE_EMAIL}}**, se acuerda lo siguiente:

## 1) Objeto del contrato
Prestacion del tratamiento odontologico de alta complejidad: **{{TRATAMIENTO}}**.

## 2) Precio del tratamiento
- Monto total pactado: **{{MONTO_TOTAL_USD}}**.
- Referencia en pesos al dia de emision (BNA Venta {{BNA_VENTA}}): **{{MONTO_TOTAL_ARS}}**.

## 3) Entrega inicial (anticipo)
- Anticipo seleccionado: **{{ANTICIPO_PCT}}%**.
- Anticipo equivalente: **{{ANTICIPO_USD}}** (referencia ARS: **{{ANTICIPO_ARS}}**).

## 4) Saldo financiado
- Capital a financiar: **{{SALDO_FINANCIADO_USD}}** (referencia ARS: **{{SALDO_FINANCIADO_ARS}}**).
- Tasa nominal aplicada: **{{INTERES_MENSUAL_PCT}}% mensual** (interes simple).
- Plan de pago: **{{CUOTAS}} cuotas mensuales** de **{{CUOTA_USD}}** cada una.
- Referencia por cuota al dia de emision: **{{CUOTA_ARS}}**.
- Vencimiento de primera cuota: **{{FECHA_PRIMERA_CUOTA}}**.

> Cada cuota se cancela en pesos argentinos al **tipo de cambio vendedor del Banco Nacion Argentina (BNA) vigente al dia de pago**.

## 5) Mora e interes punitorio
En caso de mora, se devenga un interes punitorio de **{{PUNITORIO_DIARIO_PCT}}% diario** sobre el monto impago.

Ejemplo sobre una cuota de referencia:
- Punitorio diario en USD: **{{PUNITORIO_DIARIO_CUOTA_USD}}**.
- Punitorio diario en ARS (BNA Venta del dia): **{{PUNITORIO_DIARIO_CUOTA_ARS}}**.

## 6) Jurisdiccion y conformidad
Las partes declaran conocer y aceptar integramente las condiciones del presente acuerdo.

---

**Firma AM DENTAL (Fullsthetic S.A.)**

**Firma Paciente**
`;

function replacePlaceholders(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce((result, [key, value]) => {
        return result.replaceAll(`{{${key}}}`, value);
    }, template);
}

export function buildContractMarkdown(data: ContractTemplateData): string {
    return replacePlaceholders(AM_DENTAL_CONTRACT_TEMPLATE, {
        FECHA_CONTRATO: data.fechaContrato,
        PACIENTE_NOMBRE: data.pacienteNombreCompleto,
        PACIENTE_DOCUMENTO: data.pacienteDocumento,
        PACIENTE_DOMICILIO: data.pacienteDomicilio,
        PACIENTE_EMAIL: data.pacienteEmail,
        TRATAMIENTO: data.tratamiento,
        MONTO_TOTAL_USD: formatUsd(data.montoTotalUsd),
        MONTO_TOTAL_ARS: formatArs(data.montoTotalArs),
        ANTICIPO_PCT: data.anticipoPct.toFixed(0),
        ANTICIPO_USD: formatUsd(data.anticipoUsd),
        ANTICIPO_ARS: formatArs(data.anticipoArs),
        SALDO_FINANCIADO_USD: formatUsd(data.saldoFinanciadoUsd),
        SALDO_FINANCIADO_ARS: formatArs(data.saldoFinanciadoArs),
        CUOTAS: String(data.cuotas),
        CUOTA_USD: formatUsd(data.cuotaUsd),
        CUOTA_ARS: formatArs(data.cuotaArs),
        INTERES_MENSUAL_PCT: data.interesMensualPct.toFixed(2),
        PUNITORIO_DIARIO_PCT: data.punitorioDiarioPct.toFixed(2),
        PUNITORIO_DIARIO_CUOTA_USD: formatUsd(data.punitorioDiarioCuotaUsd),
        PUNITORIO_DIARIO_CUOTA_ARS: formatArs(data.punitorioDiarioCuotaArs),
        BNA_VENTA: formatArs(data.bnaVenta),
        FECHA_PRIMERA_CUOTA: data.fechaPrimeraCuota,
    });
}
