import { getCurrentWorkerProfile, getUserAppProfile } from '@/app/actions/worker-portal';
import PortalLayoutClient from './PortalLayoutClient';

function initialsFor(name?: string, lastName?: string) {
    const initials = `${name?.[0] || ''}${lastName?.[0] || ''}`.trim();
    return initials || 'AM';
}

export default async function WorkerPortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [worker, appProfile] = await Promise.all([
        getCurrentWorkerProfile(),
        getUserAppProfile(),
    ]);
    const workerName = worker ? `${worker.nombre} ${worker.apellido || ''}`.trim() : 'Portal AM';

    return (
        <PortalLayoutClient
            workerName={workerName}
            workerRole={worker?.categoria || appProfile?.categoria || worker?.tipo || 'Prestador'}
            workerInitials={initialsFor(worker?.nombre, worker?.apellido)}
        >
            {children}
        </PortalLayoutClient>
    );
}
