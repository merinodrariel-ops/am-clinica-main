'use client';

import { useEffect, useState } from 'react';
import { UserX, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface UserAlert {
    type: 'pending' | 'suspended';
    count: number;
    users: { id: string, full_name: string, email: string, date: string }[];
}

interface Profile {
    id: string;
    full_name: string;
    email: string;
    estado: string;
    created_at: string;
    invitation_sent_at: string;
}

export default function UserAlerts() {
    const [alerts, setAlerts] = useState<UserAlert[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function checkUsers() {
            try {
                // Fetch profiles with issues
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, full_name, email, estado, created_at, invitation_sent_at')
                    .in('estado', ['invitado', 'suspendido']);

                if (error) throw error;

                const profiles = data as unknown as Profile[];

                const pending = profiles?.filter((p) => p.estado === 'invitado') || [];
                const suspended = profiles?.filter((p) => p.estado === 'suspendido') || [];

                const newAlerts: UserAlert[] = [];

                if (pending.length > 0) {
                    newAlerts.push({
                        type: 'pending',
                        count: pending.length,
                        users: pending.map((u) => ({
                            id: u.id,
                            full_name: u.full_name || 'Sin nombre',
                            email: u.email || '',
                            date: u.invitation_sent_at || u.created_at
                        }))
                    });
                }

                if (suspended.length > 0) {
                    newAlerts.push({
                        type: 'suspended',
                        count: suspended.length,
                        users: suspended.map((u) => ({
                            id: u.id,
                            full_name: u.full_name || 'Sin nombre',
                            email: u.email || '',
                            date: u.created_at // specific date of suspension requires audit log, simplified here
                        }))
                    });
                }

                setAlerts(newAlerts);

            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }

        checkUsers();
    }, []);

    if (loading || alerts.length === 0) return null;

    return (
        <div className="space-y-4 mb-8">
            {alerts.map(alert => (
                <div key={alert.type}
                    className={`rounded-xl p-4 border ${alert.type === 'pending'
                        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800'
                        : 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-800'
                        }`}
                >
                    <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${alert.type === 'pending' ? 'bg-yellow-100 text-yellow-600' : 'bg-orange-100 text-orange-600'
                            }`}>
                            {alert.type === 'pending' ? <Clock size={24} /> : <UserX size={24} />}
                        </div>
                        <div className="flex-1">
                            <h3 className={`text-lg font-semibold ${alert.type === 'pending' ? 'text-yellow-900 dark:text-yellow-100' : 'text-orange-900 dark:text-orange-100'
                                }`}>
                                {alert.type === 'pending' ? 'Invitaciones Pendientes' : 'Usuarios Suspendidos'}
                            </h3>
                            <p className={`mb-3 ${alert.type === 'pending' ? 'text-yellow-700' : 'text-orange-700'
                                }`}>
                                Hay {alert.count} {alert.type === 'pending' ? 'usuarios que aún no aceptaron la invitación' : 'usuarios sin acceso al sistema'}.
                            </p>

                            <div className="space-y-2 mb-4">
                                {alert.users.slice(0, 3).map(u => (
                                    <div key={u.id} className="flex justify-between text-sm bg-white/50 dark:bg-black/10 p-2 rounded">
                                        <span className="font-medium">{u.full_name}</span>
                                        <span className="opacity-70">{new Date(u.date).toLocaleDateString()}</span>
                                    </div>
                                ))}
                                {alert.count > 3 && (
                                    <p className="text-xs opacity-70 mt-1">... y {alert.count - 3} más</p>
                                )}
                            </div>

                            <Link
                                href="/admin/users"
                                className={`inline-flex items-center gap-2 text-sm font-medium hover:underline ${alert.type === 'pending' ? 'text-yellow-800' : 'text-orange-800'
                                    }`}
                            >
                                Gestionar Usuarios <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
