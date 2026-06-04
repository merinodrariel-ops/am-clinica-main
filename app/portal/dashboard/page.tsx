import { redirect } from 'next/navigation';
import { getUserAppProfile } from '@/app/actions/worker-portal';
import CommanderView from '@/components/portal/CommanderView';

export default async function WorkerDashboard() {
    const userProfile = await getUserAppProfile();

    if (['owner', 'admin'].includes(userProfile?.categoria || '')) {
        return (
            <div className="p-6 lg:p-8">
                <CommanderView />
            </div>
        );
    }

    redirect('/portal/agenda');
}
