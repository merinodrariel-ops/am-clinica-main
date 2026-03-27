'use client';

import React, { useState, useEffect } from 'react';
import { 
    Users, 
    Mail, 
    TrendingUp, 
    Target, 
    Filter, 
    Search, 
    Plus,
    RefreshCw,
    ExternalLink,
    MapPin,
    AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getMarketingLeads, getMarketingStats, getMarketingCampaigns, executeCampaign, sendTestCampaignEmail, MarketingLead } from '@/app/actions/marketing';
import { getMarketingAudit } from '@/app/actions/marketing-audit';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

export default function MarketingPage() {
    const { categoria: role } = useAuth();
    const [leads, setLeads] = useState<MarketingLead[]>([]);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [auditContent, setAuditContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'leads' | 'campaigns' | 'audit' | 'suite'>('dashboard');

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [leadsData, statsData, campaignsData, auditData] = await Promise.all([
                getMarketingLeads(),
                getMarketingStats(),
                getMarketingCampaigns(),
                getMarketingAudit()
            ]);
            setLeads(leadsData);
            setStats(statsData);
            setCampaigns(campaignsData);
            if (auditData.success) setAuditContent(auditData.content || '');
        } catch (error) {
            toast.error('Error al cargar datos de marketing');
        } finally {
            setLoading(false);
        }
    }

    if (role !== 'owner' && role !== 'admin' && role !== 'developer' && role !== 'recaptacion') {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] text-slate-400">
                <AlertCircle size={48} className="mb-4 opacity-20" />
                <p>No tienes permisos para acceder a este módulo.</p>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in text-white">
            {/* Header */}
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight drop-shadow-md">
                        Marketing & Deep Reach
                    </h1>
                    <p className="mt-1 text-slate-400">Prospectos extraclínicos y campañas de nutrición.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={loadData}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        title="Refrescar datos"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                        <Plus size={18} />
                        Nuevo {activeTab === 'campaigns' ? 'Envío' : 'Prospecto'}
                    </button>
                </div>
            </header>

            {/* Navigation Tabs */}
            <nav className="mb-8 flex gap-1 p-1 bg-black/20 border border-white/5 rounded-xl w-fit">
                {[
                    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
                    { id: 'leads', label: 'Prospectos', icon: Users },
                    { id: 'campaigns', label: 'Campañas', icon: Mail },
                    { id: 'audit', label: 'Auditoría AI', icon: Target },
                    { id: 'suite', label: 'Suite Marketing', icon: Filter }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all duration-300 ${
                            activeTab === tab.id 
                            ? 'bg-white/10 text-white border border-white/10' 
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <tab.icon size={16} />
                        <span className="text-sm font-medium">{tab.label}</span>
                    </button>
                ))}
            </nav>

            {/* Content Area */}
            <AnimatePresence mode="wait">
                {activeTab === 'dashboard' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        key="dashboard"
                        className="space-y-8"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard 
                                title="Total Prospectos" 
                                value={stats?.total || 0} 
                                icon={Users} 
                                color="text-blue-400" 
                                desc="Leads detectados"
                            />
                            <StatCard 
                                title="High Potential" 
                                value={stats?.highScore || 0} 
                                icon={Target} 
                                color="text-teal-400" 
                                desc="Score > 70"
                            />
                            <StatCard 
                                title="En Nutrición" 
                                value={stats?.byStatus?.nurturing || 0} 
                                icon={Mail} 
                                color="text-amber-400" 
                                desc="Campañas activas"
                            />
                            <StatCard 
                                title="Zonas Clave" 
                                value={stats?.origins?.length || 0} 
                                icon={MapPin} 
                                color="text-purple-400" 
                                desc="Puerto Madero, etc."
                            />
                        </div>

                        {/* Quick Insights / Help Card */}
                        <div className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/5 to-transparent">
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                                <AlertCircle size={20} className="text-teal-400" />
                                Estrategia Deep Reach
                            </h3>
                            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                                Estos prospectos han sido recopilados mediante scraping técnico (Google Maps, Social Media).
                                No son pacientes directos — requieren un proceso de nutrición vía <strong>Newsletter</strong> o 
                                <strong> contacto indirecto</strong> para convertirlos en interesados reales sin saturar la base clínica.
                            </p>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'leads' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        key="leads"
                        className="glass-card rounded-2xl border border-white/10 overflow-hidden"
                    >
                        {/* Leads Table logic remains the same, but encapsulated in motion.div */}
                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por nombre, empresa o zona..."
                                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-teal-500/50"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-white/10 rounded-lg hover:bg-white/5 text-slate-400 transition-colors">
                                    <Filter size={14} />
                                    Filtros
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/[0.01] border-b border-white/5">
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Nombre / Empresa</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Contacto</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Origen</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-center">Score</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {leads.map((lead) => (
                                        <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-200">{lead.full_name || 'Prospecto sin nombre'}</div>
                                                <div className="text-xs text-slate-500">{lead.neighborhood || 'Zona no especificada'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-300">{lead.email || '–'}</div>
                                                <div className="text-xs text-slate-500">{lead.whatsapp || '–'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center gap-1 text-xs text-slate-400 px-2 py-1 rounded bg-white/5">
                                                    <MapPin size={10} />
                                                    {lead.origin}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-sm font-bold ${
                                                    lead.lead_score > 70 ? 'text-teal-400' : 
                                                    lead.lead_score > 40 ? 'text-blue-400' : 'text-slate-500'
                                                }`}>
                                                    {lead.lead_score || 0}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <StatusBadge status={lead.status} />
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button className="p-2 text-slate-500 hover:text-white transition-colors">
                                                    <ExternalLink size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {leads.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                                No se encontraron prospectos de marketing.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'campaigns' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        key="campaigns"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {campaigns.map((campaign) => (
                            <CampaignCard key={campaign.id} campaign={campaign} onRefresh={loadData} />
                        ))}
                        {campaigns.length === 0 && !loading && (
                            <div className="col-span-full py-12 text-center text-slate-500 glass-card rounded-2xl border border-dashed border-white/10">
                                No hay campañas creadas aún.
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === 'audit' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        key="audit"
                        className="glass-card p-8 rounded-2xl border border-white/10 max-h-[70vh] overflow-y-auto custom-scrollbar"
                    >
                        <div className="prose prose-invert prose-teal max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {auditContent || '# No hay auditoría disponible\n\nEjecuta `/market audit` para generar una.'}
                            </ReactMarkdown>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'suite' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        key="suite"
                        className="space-y-6"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <AgentToolCard 
                                title="AI Auditor" 
                                command="/market audit" 
                                desc="Analiza el sitio web completo y genera un reporte de 20+ páginas con Quick Wins."
                                icon={Target}
                            />
                            <AgentToolCard 
                                title="AI Copywriter" 
                                command="/market copy" 
                                desc="Genera guiones para Reels, anuncios o emails basados en el perfil del paciente."
                                icon={Mail}
                            />
                            <AgentToolCard 
                                title="AI Funnel Designer" 
                                command="/market funnel" 
                                desc="Arquitecta embudos de conversión para tratamientos específicos (ej. Carillas)."
                                icon={Filter}
                            />
                            <AgentToolCard 
                                title="Competitor Analysis" 
                                command="/market competitive" 
                                desc="Compara la clínica contra competidores locales en CABA."
                                icon={Search}
                            />
                            <AgentToolCard 
                                title="Strategic Planning" 
                                command="/market strategy" 
                                desc="Crea un plan de 90 días para escalar la captación de pacientes."
                                icon={TrendingUp}
                            />
                        </div>

                        <div className="p-6 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-300">
                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                                <AlertCircle size={18} />
                                Cómo usar estos agentes
                            </h4>
                            <p className="text-sm opacity-80 leading-relaxed">
                                Estas herramientas están integradas como <strong>Skills de Agente</strong>. 
                                Para usarlas, simplemente pídeme en el chat que ejecutes el comando correspondiente o que analices un aspecto específico usando la Suite de Marketing.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function CampaignCard({ campaign, onRefresh }: { campaign: any, onRefresh: () => void }) {
    const [loading, setLoading] = useState(false);
    
    const handleSend = async () => {
        if (!confirm('¿Estás seguro de que quieres ejecutar esta campaña?')) return;
        setLoading(true);
        try {
            const res = await executeCampaign(campaign.id);
            if (res.success) {
                toast.success(`Campaña ejecutada: ${res.stats?.sent} enviados, ${res.stats?.failed} fallidos`);
                onRefresh();
            } else {
                toast.error(res.error);
            }
        } catch (error) {
            toast.error('Error al ejecutar campaña');
        } finally {
            setLoading(false);
        }
    };

    const handleTest = async () => {
        const email = prompt('Introduce el email de prueba:');
        if (!email) return;
        setLoading(true);
        try {
            const res = await sendTestCampaignEmail(campaign.id, email);
            if (res.success) {
                toast.success('Email de prueba enviado');
            } else {
                toast.error(res.error);
            }
        } catch (error) {
            toast.error('Error al enviar test');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10 hover:border-teal-500/30 transition-all flex flex-col h-full bg-gradient-to-br from-white/[0.01] to-transparent">
            <div className="flex items-center justify-between mb-4">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    campaign.status === 'completed' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 
                    campaign.status === 'sending' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                    'bg-slate-500/10 text-slate-400 border-slate-500/20'
                }`}>
                    {campaign.status}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Mail size={12} />
                    Email
                </span>
            </div>
            
            <h3 className="text-lg font-semibold mb-2 group-hover:text-teal-400 transition-colors uppercase tracking-tight">
                {campaign.name}
            </h3>
            <p className="text-sm text-slate-400 mb-6 flex-1 line-clamp-2">
                {campaign.description || 'Sin descripción.'}
            </p>

            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-white/5">
                <button 
                    onClick={handleSend}
                    disabled={loading || campaign.status === 'completed'}
                    className="flex-1 py-3 text-xs font-bold rounded-lg border border-teal-500/50 text-teal-400 hover:bg-teal-500/10 transition-colors disabled:opacity-50"
                >
                    {campaign.status === 'completed' ? 'Enviada' : loading ? 'Enviando...' : 'Ejecutar Envío'}
                </button>
                <button 
                    onClick={handleTest}
                    disabled={loading}
                    className="p-3 text-slate-500 hover:text-white border border-white/5 rounded-lg hover:bg-white/5 transition-colors"
                    title="Enviar Test"
                >
                    <Target size={16} />
                </button>
            </div>
        </div>
    );
}

function AgentToolCard({ title, command, desc, icon: Icon }: any) {
    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10 hover:border-teal-500/30 transition-all group">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/10 text-teal-400">
                    <Icon size={20} />
                </div>
                <h3 className="font-semibold">{title}</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 h-10 line-clamp-2">{desc}</p>
            <div className="p-2 rounded bg-black/40 border border-white/5 font-mono text-[10px] text-teal-400/70 group-hover:text-teal-400 transition-colors">
                {command}
            </div>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color, desc }: any) {
    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10 hover:border-white/20 transition-all">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-2 rounded-lg bg-white/5 border border-white/5 ${color}`}>
                    <Icon size={24} />
                </div>
            </div>
            <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-sm text-slate-300">{title}</div>
                <div className="mt-2 text-xs text-slate-500">{desc}</div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const configs: any = {
        new: { label: 'Nuevo', class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        nurturing: { label: 'Nutriendo', class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        qualified: { label: 'Calificado', class: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
        disqualified: { label: 'Descalificado', class: 'bg-red-500/10 text-red-400 border-red-500/20' },
        converted: { label: 'Convertido', class: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    };

    const config = configs[status] || configs.new;

    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.class}`}>
            {config.label}
        </span>
    );
}
