'use client';

import { useEffect, useState } from 'react';
import { UserX, Clock, ArrowRight } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();
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
                    className={`rounded-xl p-4 border glass-card ${alert.type === 'pending'
                        ? 'bg-yellow-500/5 border-yellow-500/20'
                        : 'bg-orange-500/5 border-orange-500/20'
                        }`}
                >
                    <div className="flex items-start gap-4">
                        <div className={`p-2 rounded-lg ${alert.type === 'pending' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-orange-500/10 text-orange-500'
                            }`}>
                            {alert.type === 'pending' ? <Clock size={24} /> : <UserX size={24} />}
                        </div>
                        <div className="flex-1">
                            <h3 className={`text-lg font-semibold drop-shadow-sm ${alert.type === 'pending' ? 'text-yellow-400' : 'text-orange-400'
                                }`}>
                                {alert.type === 'pending' ? 'Invitaciones Pendientes' : 'Usuarios Suspendidos'}
                            </h3>
                            <p className={`mb-3 ${alert.type === 'pending' ? 'text-yellow-500/70' : 'text-orange-500/70'
                                }`}>
                                Hay {alert.count} {alert.type === 'pending' ? 'usuarios que aún no aceptaron la invitación' : 'usuarios sin acceso al sistema'}.
                            </p>

                            <div className="space-y-2 mb-4">
                                {alert.users.slice(0, 3).map(u => (
                                    <div key={u.id} className="flex justify-between text-sm bg-black/20 border border-white/5 p-2 rounded text-slate-300">
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
                                className={`inline-flex items-center gap-2 text-sm font-medium hover:underline ${alert.type === 'pending' ? 'text-yellow-500' : 'text-orange-500'
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
