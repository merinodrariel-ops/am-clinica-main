export type ProsoftRepairRegistro = {
    fecha: string;
    entrada: string;
    salida: string;
    salidaDiaSiguiente?: boolean;
    horas: number;
    incompleto?: boolean;
    requiereRevision?: boolean;
    motivoObservado?: 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' | 'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
    observaciones?: string;
    marcaciones?: string[];
};

function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
}

function isNextCalendarDay(previousDate: string, nextDate: string): boolean {
    const previous = new Date(`${previousDate}T12:00:00`);
    const next = new Date(`${nextDate}T12:00:00`);
    const diffMs = next.getTime() - previous.getTime();
    return diffMs > 0 && diffMs <= 36 * 60 * 60 * 1000;
}

function computeHours(entrada: string, salida: string): { horas: number; overnight: boolean } {
    const start = timeToMinutes(entrada);
    let end = timeToMinutes(salida);
    let overnight = false;

    if (end < start) {
        end += 24 * 60;
        overnight = true;
    }

    return {
        horas: Math.round(((end - start) / 60) * 100) / 100,
        overnight,
    };
}

export function repairOvernightExitMarks<T extends ProsoftRepairRegistro>(
    registros: T[],
    parseRemainingMarks?: (marks: string[], raw: string) => Partial<T> | null
): T[] {
    const sorted = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));

    for (let index = 1; index < sorted.length; index++) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        const firstCurrentMark = current.marcaciones?.[0];

        const previousNeedsExit =
            previous.motivoObservado === 'FaltaEgreso' &&
            previous.entrada !== '00:00' &&
            previous.salida === '00:00';

        const currentCanDonateEarlyExit =
            Boolean(firstCurrentMark) &&
            isNextCalendarDay(previous.fecha, current.fecha) &&
            timeToMinutes(firstCurrentMark!) <= 5 * 60 &&
            (current.marcaciones?.length || 0) >= 1;

        if (!previousNeedsExit || !currentCanDonateEarlyExit) continue;

        const { horas, overnight } = computeHours(previous.entrada, firstCurrentMark!);
        if (!overnight || horas <= 0 || horas > 18) continue;

        previous.salida = firstCurrentMark!;
        previous.salidaDiaSiguiente = true;
        previous.horas = horas;
        previous.incompleto = false;
        previous.requiereRevision = false;
        previous.motivoObservado = undefined;
        previous.observaciones = `Salida de madrugada tomada del día siguiente (${current.fecha} ${firstCurrentMark})`;

        const remainingMarks = current.marcaciones!.slice(1);
        if (remainingMarks.length === 0) {
            sorted.splice(index, 1);
            index -= 1;
        } else {
            const repairedCurrent = parseRemainingMarks?.(remainingMarks, remainingMarks.join(' '));
            if (repairedCurrent) {
                Object.assign(current, repairedCurrent);
            }
        }
    }

    return sorted;
}
