'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();

export function useUserRole() {
    const [categoria, setCategoria] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function getCategoria() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setCategoria(null);
                    return;
                }

                const { data, error } = await supabase
                    .from('profiles')
                    .select('categoria')
                    .eq('id', user.id)
                    .single();

                if (!error && data) {
                    setCategoria(data.categoria);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }

        getCategoria();
    }, []);

    return { categoria, loading };
}
