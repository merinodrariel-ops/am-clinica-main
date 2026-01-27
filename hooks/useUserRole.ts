'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useUserRole() {
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function getRole() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setRole(null);
                    return;
                }

                const { data, error } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (!error && data) {
                    setRole(data.role);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }

        getRole();
    }, []);

    return { role, loading };
}
