'use server';

/**
 * app/actions/marketing.ts
 * 
 * Acciones de servidor para el nuevo Sistema de Leads de Marketing.
 * Separa a los prospectos fríos/scraped de la lista clínica de pacientes.
 */

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { EmailService } from '@/lib/email-service';

export type MarketingLeadStatus = 'new' | 'contacted' | 'nurturing' | 'qualified' | 'converted' | 'disqualified';

export interface MarketingLead {
    id: string;
    created_at: string;
    origin: string;
    full_name: string | null;
    email: string | null;
    whatsapp: string | null;
    neighborhood: string | null;
    source_id: string | null;
    lead_score: number;
    status: MarketingLeadStatus;
    interest_tags: string[];
    metadata: any;
    notes: string | null;
}

/**
 * Obtiene todos los leads de marketing con filtros opcionales.
 */
export async function getMarketingLeads(filters?: { status?: MarketingLeadStatus; origin?: string }) {
    const supabase = await createClient();
    
    let query = supabase
        .from('marketing_leads')
        .select('*')
        .order('lead_score', { ascending: false })
        .order('created_at', { ascending: false });

    if (filters?.status) {
        query = query.eq('status', filters.status);
    }
    if (filters?.origin) {
        query = query.ilike('origin', `%${filters.origin}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching marketing leads:', error);
        return [];
    }

    return data as MarketingLead[];
}

/**
 * Actualiza el estado de un lead.
 */
export async function updateLeadStatus(leadId: string, status: MarketingLeadStatus) {
    const supabase = await createClient();
    
    const { error } = await supabase
        .from('marketing_leads')
        .update({ status })
        .eq('id', leadId);

    if (error) {
        console.error('Error updating lead status:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/marketing');
    return { success: true };
}

/**
 * Obtiene estadísticas generales del funnel de marketing.
 */
export async function getMarketingStats() {
    const supabase = await createClient();
    
    const { data: leads, error } = await supabase
        .from('marketing_leads')
        .select('status, lead_score, origin');

    if (error || !leads) {
        return { total: 0, byStatus: {}, highScore: 0 };
    }

    const stats = {
        total: leads.length,
        byStatus: leads.reduce((acc: any, lead) => {
            acc[lead.status] = (acc[lead.status] || 0) + 1;
            return acc;
        }, {}),
        highScore: leads.filter(l => (l.lead_score || 0) > 70).length,
        origins: Array.from(new Set(leads.map(l => l.origin)))
    };

    return stats;
}

/**
 * Obtiene las campañas de marketing.
 */
export async function getMarketingCampaigns() {
    const supabase = await createClient();
    
    const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching campaigns:', error);
        return [];
    }

    return data;
}

/**
 * Crea una nueva campaña.
 */
export async function createCampaign(campaign: {
    name: string;
    subject: string;
    description?: string;
    html_content: string;
}) {
    const supabase = await createClient();
    
    const { data, error } = await supabase
        .from('marketing_campaigns')
        .insert([{
            ...campaign,
            status: 'draft'
        }])
        .select()
        .single();

    if (error) {
        console.error('Error creating campaign:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/marketing');
    return { success: true, data };
}

/**
 * Envía un correo de prueba de una campaña.
 */
export async function sendTestCampaignEmail(campaignId: string, testEmail: string) {
    const supabase = await createClient();
    
    const { data: campaign, error: cError } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

    if (cError || !campaign) {
        return { success: false, error: 'Campaña no encontrada' };
    }

    try {
        const result = await EmailService.send({
            to: testEmail,
            subject: `[TEST] ${campaign.subject || campaign.name}`,
            html: campaign.html_content
        });

        if (!result.success) throw new Error(result.error);

        return { success: true };
    } catch (error) {
        console.error('Error sending test email:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
}

/**
 * Ejecuta una campaña para un grupo de leads.
 */
export async function executeCampaign(campaignId: string, targetStatus: MarketingLeadStatus = 'new') {
    const supabase = await createClient();
    
    // 1. Get Campaign
    const { data: campaign, error: cError } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

    if (cError || !campaign) return { success: false, error: 'Campaña no encontrada' };

    // 2. Get Leads
    const { data: leads, error: lError } = await supabase
        .from('marketing_leads')
        .select('id, email, full_name')
        .eq('status', targetStatus)
        .is('email', 'not.null');

    if (lError || !leads || leads.length === 0) {
        return { success: false, error: 'No hay leads con email para este estado' };
    }

    // 3. Mark campaign as sending
    await supabase.from('marketing_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaignId);

    let sent = 0;
    let failed = 0;

    // 4. Send individually
    for (const lead of leads) {
        try {
            const res = await EmailService.send({
                to: lead.email!,
                subject: campaign.subject || campaign.name,
                html: campaign.html_content
            });

            if (res.success) {
                sent++;
                await supabase.from('marketing_campaign_leads').insert([{
                    campaign_id: campaignId,
                    lead_id: lead.id,
                    delivery_status: 'delivered',
                    sent_at: new Date().toISOString()
                }]);
            } else {
                failed++;
            }
        } catch (e) {
            failed++;
        }
    }

    // 5. Complete campaign
    await supabase.from('marketing_campaigns')
        .update({ 
            status: 'completed',
            sent_at: new Date().toISOString()
        })
        .eq('id', campaignId);

    revalidatePath('/marketing');
    return { success: true, stats: { sent, failed } };
}
