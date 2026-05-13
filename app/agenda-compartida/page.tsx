import { AlertTriangle } from 'lucide-react';
import { getAgendaFromShareToken } from '@/app/actions/doctor-agenda';
import MinimalAgendaDay from '@/components/portal/MinimalAgendaDay';

export default async function SharedAgendaPage({
    searchParams,
}: {
    searchParams: Promise<{ t?: string | string[] }>;
}) {
    const params = await searchParams;
    const token = typeof params.t === 'string' ? params.t : '';
    const result = await getAgendaFromShareToken(token);

    if (!result.success) {
        return (
            <main className="min-h-screen bg-[#0a0a0f] px-4 py-12 text-slate-100">
                <div className="mx-auto max-w-lg rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center">
                    <AlertTriangle size={34} className="mx-auto mb-4 text-red-300" />
                    <h1 className="text-2xl font-black text-white">Link no disponible</h1>
                    <p className="mt-2 text-sm text-red-100/80">{result.error}</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#0a0a0f] px-4 py-8 text-slate-100">
            <MinimalAgendaDay agenda={result.agenda} shared />
            <p className="mx-auto mt-6 max-w-4xl text-center text-[11px] text-slate-600">
                Vista operativa de agenda. No incluye datos de contacto, historia clínica, archivos ni información financiera.
            </p>
        </main>
    );
}
