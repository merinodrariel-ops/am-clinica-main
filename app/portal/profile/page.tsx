import { getCurrentWorkerProfile } from '@/app/actions/worker-portal';
import ProfileForm from './ProfileForm';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
    const worker = await getCurrentWorkerProfile();

    if (!worker) {
        redirect('/portal/dashboard');
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 pb-16">
            <div className="border-b border-slate-800/50 pb-6">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Mi Ficha</h1>
                <p className="text-slate-400 mt-1 font-medium">Tus datos personales, documentación y configuración profesional.</p>
            </div>
            <ProfileForm worker={worker} />
        </div>
    );
}
