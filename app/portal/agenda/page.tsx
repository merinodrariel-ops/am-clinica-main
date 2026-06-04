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
        <div className="space-y-4 pb-16">
            <div className="sticky top-[65px] z-20 -mx-3 border-b border-slate-800/70 bg-[#0a0a0f]/95 px-3 py-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:flex-wrap">
                    <Link
                        href={`/portal/agenda?date=${prevDate}`}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-2 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:text-white sm:px-3 sm:text-sm"
                    >
                        <ChevronLeft size={16} />
                        <span className="hidden min-[380px]:inline">Anterior</span>
                    </Link>
                    <Link
                        href={`/portal/agenda?date=${today}`}
                        className="min-h-11 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-center text-sm font-bold text-indigo-300 hover:bg-indigo-500/20"
                    >
                        Hoy
                    </Link>
                    <Link
                        href={`/portal/agenda?date=${nextDate}`}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-2 py-2 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:text-white sm:px-3 sm:text-sm"
                    >
                        <span className="hidden min-[380px]:inline">Siguiente</span>
                        <ChevronRight size={16} />
                    </Link>
                </div>
            </div>
            <MinimalAgendaDay agenda={agenda} />
        </div>
    );
}
