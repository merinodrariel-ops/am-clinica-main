import { getCurrentWorkerProfile } from '@/app/actions/worker-portal';
import PortalLayoutClient from './PortalLayoutClient';

export default async function WorkerPortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const worker = await getCurrentWorkerProfile();

    const workerName = worker ? `${worker.nombre} ${worker.apellido || ''}`.trim() : '';
    const workerRole = worker?.rol || '';
    const initials = workerName
        .split(' ')
        .slice(0, 2)
        .map(n => n[0])
        .join('')
        .toUpperCase() || '?';

    return (
        <PortalLayoutClient
            workerName={workerName}
            workerRole={workerRole}
            workerInitials={initials}
        >
            {children}
        </PortalLayoutClient>
    );
}
