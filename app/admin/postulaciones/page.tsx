import JobApplicationsAdminPanel from '@/components/job-applications/JobApplicationsAdminPanel';
import { listJobApplications } from '@/app/actions/job-applications';

export const metadata = {
    title: 'Postulaciones | AM Clínica',
};

export default async function PostulacionesPage() {
    const rows = await listJobApplications();

    return (
        <main className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-white md:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Team AM</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight">Postulaciones laborales</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        Revisión interna de personas que completaron el formulario público “Trabajá con nosotros”.
                    </p>
                </div>
                <JobApplicationsAdminPanel initialRows={rows} />
            </div>
        </main>
    );
}
