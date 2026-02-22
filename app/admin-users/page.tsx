'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { resendUserAccessEmail, inviteUser, setUserPassword, updateUser } from '@/app/actions/user-management';
import RoleGuard from '@/components/auth/RoleGuard';
import {
    Mail,
    Plus,
    Loader2,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Key,
    Lock,
    Edit2,
    Search
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

    const [resendingId, setResendingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Edit User State
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedUserForEdit, setSelectedUserForEdit] = useState<Profile | null>(null);
    const [editData, setEditData] = useState({ fullName: '', role: '', telefono: '' });
    const [editStatus, setEditStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'success_refresh'>('idle');

    // Password Reset Manual State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUserForPassword, setSelectedUserForPassword] = useState<Profile | null>(null);
    const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
    const [passwordStatus, setPasswordStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const loadUsers = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error loading users:', err);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

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
        } catch (_error) {
            setActionMessage({ type: 'error', text: 'Error inesperado.' });
        } finally {
            setResendingId(null);
            setTimeout(() => setActionMessage(null), 4000);
        }
    }



    async function handlePasswordSubmit() {
        if (!selectedUserForPassword || !session?.user?.id) return;

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordStatus('error');
            setErrorMessage('Las contraseñas no coinciden.');
            return;
        }

        if (passwordData.newPassword.length < 6) {
            setPasswordStatus('error');
            setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setPasswordStatus('loading');
        setErrorMessage('');

        try {
            const result = await setUserPassword(selectedUserForPassword.id, passwordData.newPassword, session.user.id);

            if (result.success) {
                setPasswordStatus('success');
                setActionMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' });
                setTimeout(() => {
                    setShowPasswordModal(false);
                    setPasswordStatus('idle');
                    setPasswordData({ newPassword: '', confirmPassword: '' });
                    setSelectedUserForPassword(null);
                }, 1500);
            } else {
                setPasswordStatus('error');
                setErrorMessage(result.error || 'Error al actualizar contraseña.');
            }
        } catch (_error) {
            setPasswordStatus('error');
            setErrorMessage('Error inesperado.');
        }
    }

    function openPasswordModal(user: Profile) {
        setSelectedUserForPassword(user);
        setPasswordData({ newPassword: '', confirmPassword: '' });
        setPasswordStatus('idle');
        setErrorMessage('');
        setShowPasswordModal(true);
    }

    function openEditModal(user: Profile) {
        setSelectedUserForEdit(user);
        setEditData({
            fullName: user.full_name || '',
            role: user.role || 'partner_viewer',
            telefono: (user as any).telefono || ''
        });
        setEditStatus('idle');
        setErrorMessage('');
        setShowEditModal(true);
    }

    async function handleEditSubmit() {
        if (!selectedUserForEdit || !session?.user?.id) return;

        setEditStatus('loading');
        setErrorMessage('');

        try {
            const result = await updateUser(selectedUserForEdit.id, {
                full_name: editData.fullName,
                role: editData.role,
                telefono: editData.telefono
            });

            if (result.success) {
                setEditStatus('success');
                setActionMessage({ type: 'success', text: 'Usuario actualizado correctamente.' });
                setTimeout(() => {
                    setShowEditModal(false);
                    setEditStatus('idle');
                    loadUsers();
                }, 1000);
            } else {
                setEditStatus('error');
                setErrorMessage(result.error || 'Error al actualizar usuario.');
            }
        } catch (_error) {
            setEditStatus('error');
            setErrorMessage('Error inesperado.');
        } finally {
            setTimeout(() => setActionMessage(null), 4000);
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

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar usuarios..."
                                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                        >
                            <Plus size={20} />
                            Invitar Usuario
                        </button>
                    </div>
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
                                ) : users
                                    .filter(user =>
                                        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        user.role?.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                    .map((user) => (
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

                                                    <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 dark:text-gray-400 dark:bg-gray-900/20 dark:hover:bg-gray-900/40 rounded-lg transition-colors"
                                                        title="Editar usuario"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>

                                                    <button
                                                        onClick={() => openPasswordModal(user)}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 dark:text-purple-400 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
                                                        title="Establecer contraseña manualmente"
                                                    >
                                                        <Key size={16} />
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
                                        <option value="asistente">Asistente</option>
                                        <option value="odontologo">Odontólogo</option>
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

                {/* Password Modal */}
                {showPasswordModal && selectedUserForPassword && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Key className="text-purple-600" size={20} />
                                    Nueva Contraseña
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Para: <span className="font-semibold">{selectedUserForPassword.full_name || selectedUserForPassword.email}</span>
                                </p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nueva Contraseña</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input
                                            type="password"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
                                            value={passwordData.newPassword}
                                            onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                            placeholder="Mínimo 6 caracteres"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar Contraseña</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input
                                            type="password"
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
                                            value={passwordData.confirmPassword}
                                            onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                            placeholder="Repite la contraseña"
                                        />
                                    </div>
                                </div>

                                {passwordStatus === 'error' && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                        <XCircle size={16} />
                                        {errorMessage}
                                    </div>
                                )}
                                {passwordStatus === 'success' && (
                                    <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg flex items-center gap-2">
                                        <CheckCircle2 size={16} />
                                        Contraseña actualizada.
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                                <button
                                    onClick={() => setShowPasswordModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                                    disabled={passwordStatus === 'loading'}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handlePasswordSubmit}
                                    disabled={passwordStatus === 'loading'}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70"
                                >
                                    {passwordStatus === 'loading' && <Loader2 className="animate-spin w-4 h-4" />}
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit User Modal */}
                {showEditModal && selectedUserForEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Edit2 className="text-blue-600" size={20} />
                                    Editar Usuario
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Actualizar perfil para <span className="font-semibold">{selectedUserForEdit.email}</span>
                                </p>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editData.fullName}
                                        onChange={e => setEditData({ ...editData, fullName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editData.role}
                                        onChange={e => setEditData({ ...editData, role: e.target.value })}
                                    >
                                        <option value="partner_viewer">Partner Viewer (Solo Lectura)</option>
                                        <option value="reception">Recepción</option>
                                        <option value="laboratorio">Laboratorio</option>
                                        <option value="asistente">Asistente</option>
                                        <option value="odontologo">Odontólogo</option>
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
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editData.telefono}
                                        onChange={e => setEditData({ ...editData, telefono: e.target.value })}
                                        placeholder="+54 9 ..."
                                    />
                                </div>

                                {editStatus === 'error' && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                        <XCircle size={16} />
                                        {errorMessage}
                                    </div>
                                )}
                                {editStatus === 'success' && (
                                    <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg flex items-center gap-2">
                                        <CheckCircle2 size={16} />
                                        Usuario actualizado.
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                                <button
                                    onClick={() => setShowEditModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                                    disabled={editStatus === 'loading'}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleEditSubmit}
                                    disabled={editStatus === 'loading'}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70"
                                >
                                    {editStatus === 'loading' && <Loader2 className="animate-spin w-4 h-4" />}
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </RoleGuard>
    );
}
