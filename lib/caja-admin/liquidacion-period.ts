export function getLiquidacionMonthEndISODate(mes: string) {
    const normalizedMes = mes.slice(0, 7);
    const [year, month] = normalizedMes.split('-').map(Number);

    if (!year || !month) {
        throw new Error('Mes de liquidacion invalido');
    }

    return new Date(year, month, 0).toISOString().slice(0, 10);
}
