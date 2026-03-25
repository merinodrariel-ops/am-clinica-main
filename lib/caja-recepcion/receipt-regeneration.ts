export interface ReceiptRegenerationMovement {
    monto: number;
    moneda: string;
    metodo_pago: string;
    concepto_nombre: string;
    estado: string;
    fecha_hora: string;
    fecha_movimiento?: string;
}

export interface ReceiptRegenerationEdits {
    monto: number;
    moneda: string;
    metodo_pago: string;
    concepto_nombre: string;
    estado: string;
    fecha_movimiento: string;
}

export function shouldRegenerateReceiptAfterEdit(
    original: ReceiptRegenerationMovement,
    edited: ReceiptRegenerationEdits
): boolean {
    const originalDate = original.fecha_movimiento || original.fecha_hora.split('T')[0];

    const receiptAffectingChange =
        edited.monto !== original.monto ||
        edited.moneda !== original.moneda ||
        edited.metodo_pago !== original.metodo_pago ||
        edited.concepto_nombre !== original.concepto_nombre ||
        edited.fecha_movimiento !== originalDate;

    return edited.estado === 'pagado' && receiptAffectingChange;
}
