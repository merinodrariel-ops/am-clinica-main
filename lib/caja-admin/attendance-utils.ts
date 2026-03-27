export function calculateWorkedHours(input: {
    horaIngreso?: string | null;
    horaEgreso?: string | null;
    salidaDiaSiguiente?: boolean;
}): number {
    if (!input.horaIngreso || !input.horaEgreso) return 0;

    const [inH, inM] = input.horaIngreso.split(':').map(Number);
    const [outH, outM] = input.horaEgreso.split(':').map(Number);

    const inMinutes = inH * 60 + inM;
    let outMinutes = outH * 60 + outM;

    if (input.salidaDiaSiguiente || outMinutes < inMinutes) {
        outMinutes += 24 * 60;
    }

    return Math.max(0, Math.round(((outMinutes - inMinutes) / 60) * 100) / 100);
}

export function inferSalidaDiaSiguiente(horaIngreso?: string | null, horaEgreso?: string | null): boolean {
    if (!horaIngreso || !horaEgreso) return false;

    const [inH, inM] = horaIngreso.split(':').map(Number);
    const [outH, outM] = horaEgreso.split(':').map(Number);
    return outH * 60 + outM < inH * 60 + inM;
}
