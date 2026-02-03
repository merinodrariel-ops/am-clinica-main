'use client';

import { useState, useEffect } from 'react';
import {
    Plus, MoreVertical, Mail, Ban, CheckCircle,
    Edit2, RotateCcw, Search, User as UserIcon, Phone
} from 'lucide-react';
import { inviteUser, suspendUser, reactivateUser, resetUserPassword, updateUser, resendInvitation } from '@/app/actions/user-management';

import { useRouter } from 'next/navigation';

interface User {
    id: string;
    email: string;
    full_name: string;
    role: string;
    estado: string;
    telefono?: string;
    created_at: string;
    last_sign_in_at?: string;
    invitation_sent_at?: string;
}

export default function UserManagementClient({ initialUsers }: { initialUsers: User[] }) {
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [search, setSearch] = useState('');

    const router = useRouter();

    // Modals
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [loadingAction, setLoadingAction] = useState(false);

    // Refresh data (naive implementation, better to leverage server revalidation)
    // Users are passed from server component, but for interactive updates without full reload:
    // We rely on router.refresh() which re-runs server component.

    const handleAction = async (action: () => Promise<{ success: boolean; error?: string }>) => {
        setLoadingAction(true);
        const res = await action();
        setLoadingAction(false);
        if (res.success) {
            router.refresh(); // Refresh server data
            return true;
        } else {
            alert(res.error || 'Error desconocido');
            return false;
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const success = await handleAction(() => inviteUser(formData));
        if (success) {
            setShowInviteModal(false);
            form.reset();
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const data = {
            full_name: formData.get('fullName') as string,
            telefono: formData.get('telefono') as string,
            role: formData.get('role') as string
        };

        const success = await handleAction(() => updateUser(selectedUser.id, data));
        if (success) setShowEditModal(false);
    };

    const filteredUsers = users.filter(u =>
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase())
    );

    // Update local state when prop changes (from router.refresh)
    useEffect(() => {
        setUsers(initialUsers);
    }, [initialUsers]);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
                    <p className="text-gray-500">Administra el acceso y roles del personal</p>
                </div>
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus size={20} />
                    Invitar Usuario
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                {/* Could add Role filter here */}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Usuario</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Rol</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Estado</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm">Actividad</th>
                            <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-sm text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-medium">
                                            {user.full_name?.charAt(0).toUpperCase() || <UserIcon size={20} />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{user.full_name}</p>
                                            <p className="text-sm text-gray-500">{user.email}</p>
                                            {user.telefono && (
                                                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                    <Phone size={10} /> {user.telefono}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                        ${user.role === 'owner' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                                            user.role === 'admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border
                                        ${user.estado === 'activo' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' :
                                            user.estado === 'suspendido' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' :
                                                'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${user.estado === 'activo' ? 'bg-green-500' :
                                            user.estado === 'suspendido' ? 'bg-red-500' : 'bg-yellow-500'
                                            }`} />
                                        {user.estado}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="text-sm text-gray-500 space-y-1">
                                        <p>Alta: {new Date(user.created_at).toLocaleDateString()}</p>
                                        {user.last_sign_in_at ? (
                                            <p className="text-green-600 dark:text-green-400 text-xs">Login: {new Date(user.last_sign_in_at).toLocaleDateString()}</p>
                                        ) : (
                                            <p className="text-gray-400 text-xs">Nunca ingresó</p>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="relative inline-block text-left group/menu">
                                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                                            <MoreVertical size={18} />
                                        </button>

                                        {/* Dropdown Menu (Quick CSS-only implementation for brevity, usually use Headless UI) */}
                                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-10 hidden group-hover/menu:block hover:block">
                                            <button
                                                onClick={() => { setSelectedUser(user); setShowEditModal(true); }}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                            >
                                                <Edit2 size={16} /> Editar
                                            </button>

                                            {user.estado === 'invitado' && (
                                                <button
                                                    onClick={() => handleAction(() => resendInvitation(user.email))}
                                                    className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                                                >
                                                    <Mail size={16} /> Reenviar Invitación
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleAction(() => resetUserPassword(user.email))}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                            >
                                                <RotateCcw size={16} /> Reset Password
                                            </button>

                                            {user.estado === 'suspendido' ? (
                                                <button
                                                    onClick={() => handleAction(() => reactivateUser(user.id))}
                                                    className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2"
                                                >
                                                    <CheckCircle size={16} /> Reactivar
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => { if (confirm('¿Suspender usuario?')) handleAction(() => suspendUser(user.id)); }}
                                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                                >
                                                    <Ban size={16} /> Suspender
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-xl font-bold mb-4">Invitar Nuevo Usuario</h3>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Email</label>
                                <input name="email" type="email" required className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Nombre Completo</label>
                                <input name="fullName" type="text" required className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Teléfono (Opcional)</label>
                                <input name="telefono" type="tel" className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Rol</label>
                                <select name="role" required className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700">
                                    <option value="reception">Recepción</option>
                                    <option value="admin">Admin</option>
                                    <option value="owner">Owner</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button type="button" onClick={() => setShowInviteModal(false)} className="px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancelar</button>
                                <button disabled={loadingAction} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {loadingAction ? 'Enviando...' : 'Enviar Invitación'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-xl font-bold mb-4">Editar Usuario</h3>
                        <form onSubmit={handleEdit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Nombre Completo</label>
                                <input name="fullName" defaultValue={selectedUser.full_name} type="text" required className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Teléfono</label>
                                <input name="telefono" defaultValue={selectedUser.telefono || ''} type="tel" className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Rol</label>
                                <select name="role" defaultValue={selectedUser.role} required className="w-full p-2 rounded-lg border dark:bg-gray-900 dark:border-gray-700">
                                    <option value="reception">Recepción</option>
                                    <option value="admin">Admin</option>
                                    <option value="owner">Owner</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancelar</button>
                                <button disabled={loadingAction} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {loadingAction ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
