import type { CuentaFinanciera, MovimientoLinea } from './types';

export const CASH_WITHDRAWAL_TYPE = 'RETIRO';

export function isCashAccount(account: Pick<CuentaFinanciera, 'tipo_cuenta' | 'moneda'>) {
    return account.tipo_cuenta === 'EFECTIVO' && ['ARS', 'USD'].includes(account.moneda.toUpperCase());
}

export function getAccountsForMovement(
    accounts: CuentaFinanciera[],
    movementType?: string | null,
) {
    if (movementType !== CASH_WITHDRAWAL_TYPE) return accounts;
    return accounts.filter(isCashAccount);
}

export function cashWithdrawalLinesAreValid(
    movementType: string | null | undefined,
    lines: Pick<MovimientoLinea, 'cuenta_id'>[],
    accounts: CuentaFinanciera[],
) {
    if (movementType !== CASH_WITHDRAWAL_TYPE) return true;
    if (lines.length === 0) return false;

    return lines.every((line) => {
        const account = accounts.find((item) => item.id === line.cuenta_id);
        return Boolean(account && isCashAccount(account));
    });
}
