'use client';

interface PaginationBarProps {
    page: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (page: number) => void;
}

export default function PaginationBar({ page, pageSize, totalCount, onPageChange }: PaginationBarProps) {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (totalPages <= 1) return null;

    const startIndex = (page - 1) * pageSize;

    function goToPage(p: number) {
        if (p >= 1 && p <= totalPages && p !== page) {
            onPageChange(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    return (
        <div className="glass-card flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
            <p className="text-sm text-slate-400">
                Mostrando <span className="font-medium text-white">{startIndex + 1}</span> a{' '}
                <span className="font-medium text-white">{Math.min(startIndex + pageSize, totalCount)}</span> de{' '}
                <span className="font-medium text-white">{totalCount}</span>
            </p>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 1}
                    className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                    Anterior
                </button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let p = i + 1;
                    if (totalPages > 5) {
                        if (page > 3) p = page - 2 + i;
                        if (p > totalPages) p = totalPages - (4 - i);
                    }
                    if (p < 1) p = 1;
                    return (
                        <button
                            key={i}
                            onClick={() => goToPage(p)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all ${page === p
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                : 'border border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            {p}
                        </button>
                    );
                })}
                <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page === totalPages}
                    className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                    Siguiente
                </button>
            </div>
        </div>
    );
}
