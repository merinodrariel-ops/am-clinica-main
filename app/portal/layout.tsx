export default function WorkerPortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
            <div className="max-w-5xl mx-auto p-8">
                {children}
            </div>
        </div>
    );
}
