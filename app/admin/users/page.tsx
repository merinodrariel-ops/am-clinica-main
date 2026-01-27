import { getUsers } from '@/app/actions/user-management';
import UserManagementClient from '@/components/admin/UserManagementClient';
import RoleGuard from '@/components/auth/RoleGuard';

export default async function UsersPage() {
    // 1. Fetch Users Server Side
    const result = await getUsers();

    if (!result.success) {
        return (
            <RoleGuard allowedRoles={['admin']}>
                <div className="p-8 text-center bg-red-50 dark:bg-red-900/20 m-6 rounded-xl border border-red-200 dark:border-red-800">
                    <h2 className="text-red-600 dark:text-red-400 font-bold mb-2">Error al cargar usuarios</h2>
                    <p className="text-gray-600 dark:text-gray-300 mb-2">{result.error}</p>
                    <p className="text-sm text-gray-400">Verifique su conexión o permisos.</p>
                </div>
            </RoleGuard>
        );
    }

    return (
        <RoleGuard allowedRoles={['admin']}>
            <UserManagementClient initialUsers={result.data || []} />
        </RoleGuard>
    );
}
