import type { SupabaseClient } from '@supabase/supabase-js';
import { getISODateInTimeZone } from './local-date';

export interface TodayWorkAccess { todos: boolean; recalls: boolean }
export interface TodayWorkCounts { todos: number | null; recalls: number | null }

// The caller supplies the signed-in client: RLS remains authoritative.
export async function loadTodayWork(client: SupabaseClient, access: TodayWorkAccess, now = new Date()): Promise<TodayWorkCounts> {
    const today = getISODateInTimeZone(now);
    const [todos, recalls] = await Promise.all([
        access.todos ? client.from('todos').select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'in_progress']).lte('due_date', today) : null,
        access.recalls ? client.from('recall_rules').select('id', { count: 'exact', head: true })
            .eq('is_active', true).in('state', ['pending_contact', 'contacted', 'snoozed'])
            .lte('visible_from', today).or(`snoozed_until.is.null,snoozed_until.lte.${today}`) : null,
    ]);
    return {
        todos: todos && !todos.error ? todos.count ?? 0 : null,
        recalls: recalls && !recalls.error ? recalls.count ?? 0 : null,
    };
}
