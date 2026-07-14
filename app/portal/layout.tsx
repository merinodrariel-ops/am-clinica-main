import { getCurrentWorkerProfile, getUserAppProfile } from '@/app/actions/worker-portal';
import PortalLayoutClient from './PortalLayoutClient';
import { getCategoryDefault } from '@/lib/access-overrides';

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
    const appCategory = appProfile?.categoria || null;
    const agendaOverride = appProfile?.access_overrides?.agenda;
    const hasFullAgendaAccess = agendaOverride === 'none'
        ? false
        : agendaOverride === 'read' || agendaOverride === 'edit'
            ? true
            : getCategoryDefault(appCategory || worker?.categoria || worker?.tipo || '', 'agenda') !== 'none';

    return (
        <PortalLayoutClient
            workerName={workerName}
            workerRole={worker?.categoria || appProfile?.categoria || worker?.tipo || 'Prestador'}
            workerInitials={initialsFor(worker?.nombre, worker?.apellido)}
            hasFullAgendaAccess={hasFullAgendaAccess}
        >
            {children}
        </PortalLayoutClient>
    );
}
