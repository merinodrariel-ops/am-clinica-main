import { WorkerCategory } from '@/types/worker-portal';

export function canAccessExocadGuide(
    categoria: WorkerCategory | null,
    isRealOwner: boolean
): boolean {
    if (isRealOwner) return true;
    if (!categoria) return false;

    return [
        'owner',
        'admin',
        'asistente',
        'assistant',
        'laboratorio',
        'lab',
        'technician',
    ].includes(categoria);
}
