type AdminExpenseMovement = {
    tipo_movimiento?: string | null;
    estado?: string | null;
    fecha_movimiento?: string | null;
    usd_equivalente_total?: number | null;
    caja_admin_movimiento_lineas?: Array<{
        cuenta_id?: string | null;
        usd_equivalente?: number | null;
    }> | null;
};

type AdminExpenseAccount = {
    id: string;
    tipo_cuenta?: string | null;
};

export type AdminDailyExpenseSummary = {
    totalUsd: number;
    bankUsd: number;
    cashUsd: number;
    otherUsd: number;
};

const isActiveExpense = (movement: AdminExpenseMovement) =>
    movement.tipo_movimiento === 'EGRESO' &&
    (movement.estado || '').toLowerCase() !== 'anulado';

export function calculateMonthlyAdminExpensesUsd(movements: AdminExpenseMovement[]): number {
    return movements
        .filter(isActiveExpense)
        .reduce(
            (total, movement) => total + Number(movement.usd_equivalente_total || 0),
            0
        );
}

export function calculateDailyAdminExpenseSummaryUsd(
    movements: AdminExpenseMovement[],
    accounts: AdminExpenseAccount[],
    localDate: string,
): AdminDailyExpenseSummary {
    const accountTypes = new Map(accounts.map((account) => [account.id, account.tipo_cuenta || 'OTRO']));
    const summary: AdminDailyExpenseSummary = { totalUsd: 0, bankUsd: 0, cashUsd: 0, otherUsd: 0 };

    movements
        .filter((movement) => isActiveExpense(movement) && movement.fecha_movimiento === localDate)
        .forEach((movement) => {
            const total = Number(movement.usd_equivalente_total || 0);
            summary.totalUsd += total;

            const lines = movement.caja_admin_movimiento_lineas || [];
            if (lines.length === 0) {
                summary.otherUsd += total;
                return;
            }

            lines.forEach((line) => {
                const amount = Number(line.usd_equivalente || 0);
                const accountType = line.cuenta_id ? accountTypes.get(line.cuenta_id) : undefined;
                if (accountType === 'BANCO') summary.bankUsd += amount;
                else if (accountType === 'EFECTIVO') summary.cashUsd += amount;
                else summary.otherUsd += amount;
            });
        });

    return summary;
}
