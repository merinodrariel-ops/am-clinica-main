import { getLocalISODate } from '@/lib/local-date';

export interface ContractSchedule {
    contractDateIso: string;
    firstDueDateIso: string;
}

export function getContractSchedule(baseDate: Date = new Date()): ContractSchedule {
    const contractDateIso = getLocalISODate(baseDate);
    const firstDueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 7);

    return {
        contractDateIso,
        firstDueDateIso: getLocalISODate(firstDueDate),
    };
}

export function formatIsoDateEsAr(isoDate: string): string {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-AR');
}
