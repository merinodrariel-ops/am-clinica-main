import { getCurrentWorkerProfile } from '@/app/actions/worker-portal';
import ProfileForm from './ProfileForm';
import { Users, ShieldAlert } from 'lucide-react';
import Link from 'next/navigation';

export default async function WorkerProfilePage() {
    const worker = await getCurrentWorkerProfile();

    if (!worker) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[70vh]">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                    <ShieldAlert className="text-red-400" size={40} />
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Access Restricted</h2>
                <p className="text-slate-400 mt-2 max-w-sm">
                    This portal requires a verified staff profile. If you are an employee, please contact HR to link your system ID.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800/50 pb-8">
                <div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">Personnel Management</h1>
                    <p className="text-slate-400 mt-2 font-medium">Manage your clinical identity, legal documents, and professional status.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-2xl text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    ID: {worker.id.slice(0, 8)}...
                </div>
            </div>

            <ProfileForm worker={worker} />

            <div className="pt-12 border-t border-slate-800/50">
                <p className="text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                    AM Clínica &copy; 2026 • Verified Professional Portal • All Data Encrypted
                </p>
            </div>
        </div>
    );
}
