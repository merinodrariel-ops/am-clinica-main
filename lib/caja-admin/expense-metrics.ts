type AdminExpenseMovement = {
    tipo_movimiento?: string | null;
    estado?: string | null;
    usd_equivalente_total?: number | null;
};

export function calculateMonthlyAdminExpensesUsd(movements: AdminExpenseMovement[]): number {
    return movements
        .filter((movement) =>
            movement.tipo_movimiento === 'EGRESO' &&
            (movement.estado || '').toLowerCase() !== 'anulado'
        )
        .reduce(
            (total, movement) => total + Number(movement.usd_equivalente_total || 0),
            0
        );
}
