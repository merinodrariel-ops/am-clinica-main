'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { resendUserAccessEmail, inviteUser, suspendUser, reactivateUser } from '@/app/actions/user-management';
import RoleGuard from '@/components/auth/RoleGuard';
import {
    Mail,
    Plus,
    Loader2,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Ban,
    UserCheck,
    MoreHorizontal
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Profile {
    id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    created_at: string;
}

export default function UserManagementPage() {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { session } = useAuth();
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        email: '',
        fullName: '',
        role: 'partner_viewer',
        telefono: ''
    });
    const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    // Resend/Suspend action state
    const [resendingId, setResendingId] = useState<string | null>(null);
    const [suspendingId, setSuspendingId] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    async function handleResendAccess(user: Profile) {
        if (!session?.user?.id) return;
        setResendingId(user.id);
        setActionMessage(null);

        try {
            const result = await resendUserAccessEmail(user.id, session.user.id);
            if (result.success) {
                setActionMessage({ type: 'success', text: result.message || 'Email enviado.' });
            } else {
                setActionMessage({ type: 'error', text: result.error || 'Error al enviar.' });
            }
        } catch (error) {
            setActionMessage({ type: 'error', text: 'Error inesperado.' });
        } finally {
            setResendingId(null);
            setTimeout(() => setActionMessage(null), 4000);
        }
    }

    async function handleToggleStatus(user: Profile) {
        if (!session?.user?.id) return;
        if (user.role === 'owner' || user.email.toLowerCase().includes('dr.arielmerinopersonal@gmail.com')) {
            setActionMessage({ type: 'error', text: 'No puedes suspender al dueño.' });
            return;
        }

        setSuspendingId(user.id);
        setActionMessage(null);

        try {
            const isAhuraActivo = user.is_active;
            const result = isAhuraActivo
                ? await suspendUser(user.id)
                : await reactivateUser(user.id);

            if (result.success) {
                setActionMessage({
                    type: 'success',
                    text: isAhuraActivo ? 'Usuario suspendido.' : 'Usuario reactivado.'
                });
                loadUsers(); // Refresh list
            } else {
                setActionMessage({ type: 'error', text: result.error || 'Error al actualizar estado.' });
            }
        } catch (error) {
            setActionMessage({ type: 'error', text: 'Error inesperado.' });
        } finally {
            setSuspendingId(null);
            setTimeout(() => setActionMessage(null), 3000);
        }
    }

    async function loadUsers() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleInvite() {
        setInviteStatus('loading');
        setErrorMessage('');

        try {
            const formDataToSend = new FormData();
            formDataToSend.append('email', formData.email);
            formDataToSend.append('fullName', formData.fullName);
            formDataToSend.append('role', formData.role);
            formDataToSend.append('telefono', formData.telefono);

            const result = await inviteUser(formDataToSend);

            if (!result.success) {
                throw new Error(result.error || 'Error al invitar usuario');
            }

            setInviteStatus('success');
            setTimeout(() => {
                setShowInviteModal(false);
                setInviteStatus('idle');
                setFormData({ email: '', fullName: '', role: 'partner_viewer', telefono: '' });
                loadUsers();
            }, 1000);
        } catch (error: unknown) {
            setInviteStatus('error');
            setErrorMessage(error instanceof Error ? error.message : 'Error desconocido');
        }
    }

    return (
        <RoleGuard requireOwner>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Gestión de Usuarios
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Administra el acceso y roles del personal de la clínica
                        </p>
                    </div>

                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <Plus size={20} />
                        Invitar Usuario
                    </button>
                </div>



                {/* Feedback Message */}
                {actionMessage && (
                    <div className={`mb-4 p-4 rounded-xl flex items-center gap-3 ${actionMessage.type === 'success'
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                        {actionMessage.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                        <p className="font-medium">{actionMessage.text}</p>
                    </div>
                )}

                {/* Users List */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha Alta</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                                        </td>
                                    </tr>
                                ) : users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                                                    {user.full_name?.[0] || user.email?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {user.full_name || 'Sin nombre'}
                                                    </p>
                                                    <div className="flex items-center gap-1 text-sm text-gray-500">
                                                        <Mail size={12} />
                                                        {user.email || 'No email'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                                ${user.role === 'owner' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                                                    user.role === 'admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                                        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
                                                {user.role.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.is_active ? (
                                                <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                                                    <CheckCircle2 size={14} /> Activo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                                                    <XCircle size={14} /> Inactivo
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleToggleStatus(user)}
                                                    disabled={suspendingId === user.id || user.role === 'owner'}
                                                    className={`p-1.5 rounded-lg transition-colors ${user.is_active
                                                        ? 'text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20'
                                                        : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                                    title={user.is_active ? "Suspender Usuario" : "Reactivar Usuario"}
                                                >
                                                    {suspendingId === user.id ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : user.is_active ? (
                                                        <Ban size={16} />
                                                    ) : (
                                                        <UserCheck size={16} />
                                                    )}
                                                </button>

                                                <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

                                                <button
                                                    onClick={() => handleResendAccess(user)}
                                                    disabled={resendingId === user.id}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors disabled:opacity-50"
                                                    title="Reenviar email de acceso / restablecer contraseña"
                                                >
                                                    {resendingId === user.id ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <RefreshCw size={16} />
                                                    )}
                                                    <span className="hidden sm:inline">Reenviar Acceso</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Invite Modal */}
                {showInviteModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Invitar Nuevo Usuario</h3>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800"
                                        value={formData.fullName}
                                        onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                                    <input
                                        type="email"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800"
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="partner_viewer">Partner Viewer (Solo Lectura)</option>
                                        <option value="reception">Recepción</option>
                                        <option value="laboratorio">Laboratorio</option>
                                        <option value="admin">Administrador</option>
                                        <option value="pricing_manager">Pricing Manager</option>
                                        <option value="owner">Owner (Dueño)</option>
                                        <option value="developer">Developer</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                                    <input
                                        type="tel"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800"
                                        value={formData.telefono}
                                        onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                        placeholder="+54 9 ..."
                                    />
                                </div>

                                {inviteStatus === 'error' && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                                        {errorMessage}
                                    </div>
                                )}
                                {inviteStatus === 'success' && (
                                    <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg">
                                        Usuario creado exitosamente.
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                                <button
                                    onClick={() => setShowInviteModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                                    disabled={inviteStatus === 'loading'}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleInvite}
                                    disabled={inviteStatus === 'loading'}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                                >
                                    {inviteStatus === 'loading' && <Loader2 className="animate-spin w-4 h-4" />}
                                    Crear Usuario
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </RoleGuard>
    );
}
