import Link from 'next/link';
import {
    Users,
    LayoutDashboard,
    CalendarDays,
    Settings,
    LogOut,
    Award,
    DollarSign
} from 'lucide-react';

export default function WorkerPortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-slate-900 text-slate-100 font-sans antialiased selection:bg-indigo-500/30">

            {/* Sidebar - Anthropic/Linear Style */}
            <aside className="w-64 border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl flex flex-col justify-between">
                <div>
                    {/* Header */}
                    <div className="p-6 border-b border-slate-800/50">
                        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                            AM Portal
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">Worker Access</p>
                    </div>

                    {/* Navigation */}
                    <nav className="p-4 space-y-1">
                        <NavLink href="/portal/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
                        <NavLink href="/portal/schedule" icon={<CalendarDays size={18} />} label="Schedule" />
                        <NavLink href="/portal/earnings" icon={<DollarSign size={18} />} label="Earnings & Logs" />
                        <NavLink href="/portal/profile" icon={<Users size={18} />} label="My Profile" />
                        <NavLink href="/portal/achievements" icon={<Award size={18} />} label="Achievements" />
                    </nav>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800/50">
                    <Link
                        href="/caja-admin"
                        className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-md transition-all duration-200"
                    >
                        <Settings size={16} />
                        <span>Switch to Admin</span>
                    </Link>
                    <div className="mt-2 pt-2 border-t border-slate-800/30">
                        <button className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/10 rounded-md transition-all">
                            <LogOut size={16} />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto bg-slate-950 dark:[color-scheme:dark]">
                {/* Top Header Placeholder (optional) */}
                <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-8 py-4 flex justify-between items-center">
                    <h2 className="text-sm font-medium text-slate-400">AM Clínica - Operativa 360</h2>
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-400">
                            AM
                        </div>
                    </div>
                </div>

                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-200 group"
        >
            <span className="text-slate-500 group-hover:text-indigo-400 transition-colors">{icon}</span>
            {label}
        </Link>
    );
}
