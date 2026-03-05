'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import {
    RECALL_TYPE_INTERVALS,
    type RecallRule,
    type RecallActivityLogEntry,
    type RecallType,
    type RecallState,
    type WorklistFilter,
} from '@/lib/recall-constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addMonthsToDate(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function addDaysToDate(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

function calculateDates(completedAt: Date, intervalMonths: number, windowDays: number) {
    const nextDue = addMonthsToDate(completedAt, intervalMonths);
    const visibleFrom = addDaysToDate(nextDue, -windowDays);
    return {
        next_due_date: formatDate(nextDue),
        visible_from: formatDate(visibleFrom),
    };
}

async function getUserEmail(): Promise<string> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email || 'system';
}

async function logActivity(
    ruleId: string,
    action: string,
    oldState: RecallState | null,
    newState: RecallState | null,
    details: Record<string, unknown> = {},
    performedBy?: string
) {
    const supabase = await createClient();
    const actor = performedBy || await getUserEmail();
    await supabase.from('recall_activity_log').insert({
        recall_rule_id: ruleId,
        action,
        old_state: oldState,
        new_state: newState,
        details,
        performed_by: actor,
    });
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createRecallRule(data: {
    patient_id: string;
    recall_type: RecallType;
    custom_label?: string;
    interval_months?: number;
    window_days?: number;
    last_completed_at?: string;
    notes?: string;
    contact_channels?: string[];
    priority?: number;
}) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const interval = data.interval_months ?? RECALL_TYPE_INTERVALS[data.recall_type];
    const windowDays = data.window_days ?? 30;

    let next_due_date: string | null = null;
    let visible_from: string | null = null;
    const state: RecallState = 'pending_contact';

    if (data.last_completed_at) {
        const dates = calculateDates(new Date(data.last_completed_at), interval, windowDays);
        next_due_date = dates.next_due_date;
        visible_from = dates.visible_from;
    }

    const { data: rule, error } = await supabase
        .from('recall_rules')
        .insert({
            patient_id: data.patient_id,
            recall_type: data.recall_type,
            custom_label: data.custom_label || null,
            interval_months: interval,
            window_days: windowDays,
            state,
            priority: data.priority ?? 0,
            last_completed_at: data.last_completed_at || null,
            next_due_date,
            visible_from,
            contact_channels: data.contact_channels || ['whatsapp', 'phone'],
            notes: data.notes || null,
            created_by: userEmail,
            updated_by: userEmail,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating recall rule:', error);
        return { success: false, error: error.message };
    }

    await logActivity(rule.id, 'created', null, state, {
        recall_type: data.recall_type,
        interval_months: interval,
        next_due_date,
    }, userEmail);

    revalidatePath('/recalls');
    return { success: true, data: rule };
}

// ─── WORKLIST QUERY ──────────────────────────────────────────────────────────

export async function getRecallWorklist(filter: WorklistFilter = 'all', extraFilters?: {
    recall_type?: RecallType;
    state?: RecallState;
    search?: string;
}) {
    const supabase = await createClient();
    const today = formatDate(new Date());

    let query = supabase
        .from('recall_rules')
        .select(`
      *,
      patient:patient_id (
        id_paciente, nombre, apellido, whatsapp,
        whatsapp_pais_code, whatsapp_numero, email
      )
    `)
        .eq('is_active', true)
        .not('state', 'eq', 'not_applicable')
        .not('state', 'eq', 'completed')
        .order('next_due_date', { ascending: true });

    // Date filters
    if (filter === 'today') {
        query = query.lte('visible_from', today).gte('next_due_date', today);
    } else if (filter === 'next7') {
        const in7 = formatDate(addDaysToDate(new Date(), 7));
        query = query.lte('visible_from', in7).gte('next_due_date', today);
    } else if (filter === 'next30') {
        const in30 = formatDate(addDaysToDate(new Date(), 30));
        query = query.lte('visible_from', in30).gte('next_due_date', today);
    } else if (filter === 'past_due') {
        query = query.lt('next_due_date', today);
    }

    // Extra filters
    if (extraFilters?.recall_type) {
        query = query.eq('recall_type', extraFilters.recall_type);
    }
    if (extraFilters?.state) {
        query = query.eq('state', extraFilters.state);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching recall worklist:', error);
        return [];
    }

    let results = (data || []) as RecallRule[];

    // Filter snoozed items that haven't reached their snooze date
    results = results.filter(r => {
        if (r.state === 'snoozed' && r.snoozed_until) {
            return r.snoozed_until <= today;
        }
        return true;
    });

    // Client-side search filter
    if (extraFilters?.search) {
        const s = extraFilters.search.toLowerCase();
        results = results.filter(r => {
            const pat = r.patient;
            if (!pat) return false;
            const fullName = `${pat.nombre} ${pat.apellido}`.toLowerCase();
            return fullName.includes(s) || (pat.whatsapp || '').includes(s);
        });
    }

    return results;
}

// ─── STATE TRANSITIONS ──────────────────────────────────────────────────────

export async function markRecallContacted(ruleId: string) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const { data: current } = await supabase
        .from('recall_rules')
        .select('state')
        .eq('id', ruleId)
        .single();

    const { error } = await supabase
        .from('recall_rules')
        .update({ state: 'contacted', updated_by: userEmail })
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    await logActivity(ruleId, 'contacted', current?.state, 'contacted', {}, userEmail);
    revalidatePath('/recalls');
    return { success: true };
}

export async function markRecallScheduled(ruleId: string, appointmentId?: string) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const { data: current } = await supabase
        .from('recall_rules')
        .select('state')
        .eq('id', ruleId)
        .single();

    const updates: Record<string, unknown> = {
        state: 'scheduled',
        updated_by: userEmail,
    };
    if (appointmentId) {
        updates.linked_appointment_id = appointmentId;
    }

    const { error } = await supabase
        .from('recall_rules')
        .update(updates)
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    await logActivity(ruleId, 'scheduled', current?.state, 'scheduled', {
        appointment_id: appointmentId,
    }, userEmail);
    revalidatePath('/recalls');
    return { success: true };
}

export async function markRecallCompleted(ruleId: string, completedDate?: string) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const { data: rule } = await supabase
        .from('recall_rules')
        .select('*')
        .eq('id', ruleId)
        .single();

    if (!rule) return { success: false, error: 'Rule not found' };

    const completedAt = completedDate || formatDate(new Date());
    const dates = calculateDates(
        new Date(completedAt),
        rule.interval_months,
        rule.window_days
    );

    // Complete this cycle and set up the next one
    const { error } = await supabase
        .from('recall_rules')
        .update({
            state: 'pending_contact',
            last_completed_at: completedAt,
            next_due_date: dates.next_due_date,
            visible_from: dates.visible_from,
            snoozed_until: null,
            linked_appointment_id: null,
            updated_by: userEmail,
        })
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    await logActivity(ruleId, 'completed', rule.state, 'pending_contact', {
        completed_date: completedAt,
        next_due_date: dates.next_due_date,
    }, userEmail);

    revalidatePath('/recalls');
    return { success: true };
}

export async function snoozeRecall(ruleId: string, days: number) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const { data: current } = await supabase
        .from('recall_rules')
        .select('state')
        .eq('id', ruleId)
        .single();

    const snoozedUntil = formatDate(addDaysToDate(new Date(), days));

    const { error } = await supabase
        .from('recall_rules')
        .update({
            state: 'snoozed',
            snoozed_until: snoozedUntil,
            updated_by: userEmail,
        })
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    await logActivity(ruleId, 'snoozed', current?.state, 'snoozed', {
        snooze_days: days,
        snoozed_until: snoozedUntil,
    }, userEmail);

    revalidatePath('/recalls');
    return { success: true };
}

export async function deactivateRecall(ruleId: string) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const { data: current } = await supabase
        .from('recall_rules')
        .select('state')
        .eq('id', ruleId)
        .single();

    const { error } = await supabase
        .from('recall_rules')
        .update({
            state: 'not_applicable',
            is_active: false,
            updated_by: userEmail,
        })
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    await logActivity(ruleId, 'deactivated', current?.state, 'not_applicable', {}, userEmail);
    revalidatePath('/recalls');
    return { success: true };
}

// ─── CALENDAR DATA ───────────────────────────────────────────────────────────

export async function getRecallCalendarData(year: number, month: number) {
    const supabase = await createClient();

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    const { data, error } = await supabase
        .from('recall_rules')
        .select(`
      id, recall_type, next_due_date, state, priority,
      patient:patient_id (id_paciente, nombre, apellido)
    `)
        .eq('is_active', true)
        .gte('next_due_date', startDate)
        .lt('next_due_date', endDate)
        .order('next_due_date');

    if (error) {
        console.error('Error fetching calendar data:', error);
        return [];
    }

    return data || [];
}

// ─── PATIENT CADENCE ─────────────────────────────────────────────────────────

export async function getPatientRecalls(patientId: string) {
    const supabase = await createClient();

    const { data: rules, error: rulesError } = await supabase
        .from('recall_rules')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

    if (rulesError) {
        console.error('Error fetching patient recalls:', rulesError);
        return { rules: [], logs: [] };
    }

    // Get all activity logs for these rules
    const ruleIds = (rules || []).map((r: { id: string }) => r.id);

    let logs: RecallActivityLogEntry[] = [];
    if (ruleIds.length > 0) {
        const { data: logsData } = await supabase
            .from('recall_activity_log')
            .select('*')
            .in('recall_rule_id', ruleIds)
            .order('performed_at', { ascending: false })
            .limit(50);
        logs = (logsData || []) as RecallActivityLogEntry[];
    }

    return { rules: (rules || []) as RecallRule[], logs };
}

// ─── STATS ───────────────────────────────────────────────────────────────────

export async function getRecallStats() {
    const supabase = await createClient();
    const today = formatDate(new Date());

    const { data: allRules } = await supabase
        .from('recall_rules')
        .select('id, state, next_due_date, recall_type')
        .eq('is_active', true);

    const rules = (allRules || []) as Array<{
        id: string; state: RecallState; next_due_date: string | null; recall_type: string;
    }>;

    const totalActive = rules.length;
    const pendingContact = rules.filter(r => r.state === 'pending_contact').length;
    const contacted = rules.filter(r => r.state === 'contacted').length;
    const scheduled = rules.filter(r => r.state === 'scheduled').length;
    const snoozed = rules.filter(r => r.state === 'snoozed').length;
    const pastDue = rules.filter(r =>
        r.next_due_date && r.next_due_date < today &&
        r.state !== 'completed' && r.state !== 'not_applicable'
    ).length;
    const dueThisWeek = rules.filter(r => {
        if (!r.next_due_date) return false;
        const in7 = formatDate(addDaysToDate(new Date(), 7));
        return r.next_due_date >= today && r.next_due_date <= in7;
    }).length;

    // Count by type
    const byType: Record<string, number> = {};
    rules.forEach(r => {
        byType[r.recall_type] = (byType[r.recall_type] || 0) + 1;
    });

    return {
        totalActive,
        pendingContact,
        contacted,
        scheduled,
        snoozed,
        pastDue,
        dueThisWeek,
        byType,
    };
}

// ─── DELETE / UPDATE ─────────────────────────────────────────────────────────

export async function updateRecallRule(ruleId: string, updates: {
    interval_months?: number;
    window_days?: number;
    priority?: number;
    notes?: string;
    contact_channels?: string[];
    assigned_to?: string | null;
}) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    const { error } = await supabase
        .from('recall_rules')
        .update({ ...updates, updated_by: userEmail })
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    await logActivity(ruleId, 'updated', null, null, updates, userEmail);
    revalidatePath('/recalls');
    return { success: true };
}

export async function deleteRecallRule(ruleId: string) {
    const supabase = await createClient();
    const userEmail = await getUserEmail();

    await logActivity(ruleId, 'deleted', null, null, {}, userEmail);

    const { error } = await supabase
        .from('recall_rules')
        .delete()
        .eq('id', ruleId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/recalls');
    return { success: true };
}
