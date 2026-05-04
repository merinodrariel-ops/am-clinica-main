import CategoriaGuard from '@/components/auth/CategoriaGuard';
import InternalControlClient from '@/components/admin/InternalControlClient';
import { getInternalControlData } from '@/app/actions/control-interno';

export const dynamic = 'force-dynamic';

export default async function InternalControlPage() {
    const result = await getInternalControlData();

    return (
        <CategoriaGuard allowedCategorias={['admin', 'developer']}>
            {result.success ? (
                <InternalControlClient
                    initialUsers={result.users || []}
                    initialEvents={result.events || []}
                />
            ) : (
                <div className="p-8">
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
                        <h1 className="text-xl font-bold">No se pudo cargar Control Interno</h1>
                        <p className="mt-2 text-sm">{result.error || 'Error desconocido'}</p>
                    </div>
                </div>
            )}
        </CategoriaGuard>
    );
}
