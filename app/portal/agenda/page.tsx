import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMyMinimalAgendaDay } from '@/app/actions/doctor-agenda';
import MinimalAgendaDay from '@/components/portal/MinimalAgendaDay';
import { getLocalISODate } from '@/lib/local-date';

function shiftDate(date: string, days: number) {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(year, month - 1, day);
    value.setDate(value.getDate() + days);
    return getLocalISODate(value);
}

export default async function PortalAgendaPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string | string[] }>;
}) {
    const params = await searchParams;
    const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? params.date
        : getLocalISODate();
    const agenda = await getMyMinimalAgendaDay(date);

    if (!agenda) {
        return (
            <div className="p-12 text-center text-slate-500">
                <p className="font-semibold">Perfil de prestador no encontrado.</p>
                <p className="mt-2 text-sm">Contactá a administración para vincular tu usuario.</p>
            </div>
        );
    }

    const today = getLocalISODate();
    const prevDate = shiftDate(date, -1);
    const nextDate = shiftDate(date, 1);

    return (
        <div className="space-y-6 pb-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Link
                        href={`/portal/agenda?date=${prevDate}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-slate-300 hover:border-slate-700 hover:text-white"
                    >
                        <ChevronLeft size={16} />
                        Día anterior
                    </Link>
                    <Link
                        href={`/portal/agenda?date=${today}`}
                        className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/20"
                    >
                        Hoy
                    </Link>
                    <Link
                        href={`/portal/agenda?date=${nextDate}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-slate-300 hover:border-slate-700 hover:text-white"
                    >
                        Día siguiente
                        <ChevronRight size={16} />
                    </Link>
                </div>
            </div>
            <MinimalAgendaDay agenda={agenda} />
        </div>
    );
}
