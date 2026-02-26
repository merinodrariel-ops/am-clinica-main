'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Save,
    Plus,
    Trash2,
    RefreshCw,
    Check,
    AlertCircle,
    DollarSign,
    Layout,
    Settings,
    MessageCircle,
    MapPin,
    ChevronRight,
    Star,
    Sparkles,
    CreditCard
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from 'sonner';
import { getAdmissionSettingsAction, updateAdmissionSettingsAction } from '@/app/actions/admission-settings';

export default function AdmissionSettingsPage() {
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('pricing');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        const res = await getAdmissionSettingsAction();
        if (res.success) {
            setSettings(res.settings);
        } else {
            toast.error(res.error || 'No se pudieron cargar los ajustes');
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        const res = await updateAdmissionSettingsAction(settings);
        if (res.success) {
            toast.success('Ajustes guardados correctamente');
        } else {
            toast.error(res.error || 'Error al guardar');
        }
        setSaving(false);
    };

    const updateNested = (key: string, value: any) => {
        setSettings((prev: any) => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cargando Configuración...</p>
                </div>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
                <Card className="p-10 text-center max-w-md">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Error de Conexión</h2>
                    <p className="text-slate-500 mb-6">No pudimos conectar con la base de datos de configuración.</p>
                    <Button onClick={loadSettings} className="bg-blue-600 hover:bg-blue-700 text-white">Reintentar</Button>
                </Card>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[#f8fafc] p-4 md:p-8 lg:p-12 font-sans text-slate-900">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 mb-4">
                            <Settings className="w-3 h-3 text-blue-600" />
                            <span className="text-[10px] font-bold tracking-widest uppercase text-blue-700">Panel de Control Admin</span>
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Configuración de Admisión</h1>
                        <p className="text-slate-500 mt-1 font-medium italic">Personaliza la experiencia, precios y opciones en tiempo real.</p>
                    </div>
                    <div className="flex gap-4">
                        <Button
                            variant="outline"
                            onClick={loadSettings}
                            className="h-12 px-6 rounded-2xl border-2 border-slate-200 font-bold hover:bg-white"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Descartar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="h-12 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-xl shadow-blue-200 flex items-center gap-2"
                        >
                            <Save className="w-5 h-5" />
                            {saving ? 'Guardando...' : 'Publicar Cambios'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Navigation Sidebar */}
                    <div className="lg:col-span-1 space-y-2">
                        {[
                            { id: 'pricing', label: 'Precios y Planes', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { id: 'motivation', label: 'Mensajes y UX', icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-50' },
                            { id: 'options', label: 'Opciones y Listas', icon: Layout, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-6 py-4 rounded-3xl transition-all border-2 text-sm font-bold uppercase tracking-wider ${activeTab === tab.id
                                        ? 'bg-white border-blue-500 text-blue-600 shadow-lg shadow-blue-100'
                                        : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50'
                                    }`}
                            >
                                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-600' : 'text-slate-300'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="lg:col-span-3">
                        <AnimatePresence mode="wait">
                            {activeTab === 'pricing' && (
                                <motion.div
                                    key="pricing"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="bg-emerald-100 p-3 rounded-2xl">
                                                <DollarSign className="w-6 h-6 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 leading-none">Niveles de Atención</h3>
                                                <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter font-bold">Define los precios y el branding de cada consulta</p>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            {settings.prices.map((price: any, idx: number) => (
                                                <div key={price.id} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 relative group">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="space-y-1.5 font-bold">
                                                            <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">Nombre Comercial</label>
                                                            <Input
                                                                value={price.name}
                                                                onChange={(e) => {
                                                                    const newPrices = [...settings.prices];
                                                                    newPrices[idx].name = e.target.value;
                                                                    updateNested('prices', newPrices);
                                                                }}
                                                                className="h-12 bg-white rounded-2xl border-slate-200"
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5 font-bold">
                                                            <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">Precio (Texto)</label>
                                                            <Input
                                                                value={price.price}
                                                                onChange={(e) => {
                                                                    const newPrices = [...settings.prices];
                                                                    newPrices[idx].price = e.target.value;
                                                                    updateNested('prices', newPrices);
                                                                }}
                                                                className="h-12 bg-white rounded-2xl border-slate-200 text-blue-600 font-black"
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5 font-bold md:col-span-2">
                                                            <label className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">Descripción de la Experiencia</label>
                                                            <textarea
                                                                value={price.description}
                                                                onChange={(e) => {
                                                                    const newPrices = [...settings.prices];
                                                                    newPrices[idx].description = e.target.value;
                                                                    updateNested('prices', newPrices);
                                                                }}
                                                                className="w-full h-24 p-4 bg-white rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-medium"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'motivation' && (
                                <motion.div
                                    key="motivation"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="bg-amber-100 p-3 rounded-2xl">
                                                <Sparkles className="w-6 h-6 text-amber-600" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-slate-900 leading-none">Psicología y Progreso</h3>
                                                <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter font-bold">Personaliza los mensajes de la barra de motivación</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {settings.motivational_messages.map((msg: any, idx: number) => (
                                                <div key={idx} className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex gap-6 items-start">
                                                    <div className="bg-blue-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center font-black shrink-0">
                                                        {msg.step}
                                                    </div>
                                                    <div className="flex-1 grid gap-4 md:grid-cols-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Encabezado</label>
                                                            <Input
                                                                value={msg.title}
                                                                onChange={(e) => {
                                                                    const newMsgs = [...settings.motivational_messages];
                                                                    newMsgs[idx].title = e.target.value;
                                                                    updateNested('motivational_messages', newMsgs);
                                                                }}
                                                                className="h-11 bg-white rounded-xl border-slate-200"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Frase Motivacional</label>
                                                            <Input
                                                                value={msg.message}
                                                                onChange={(e) => {
                                                                    const newMsgs = [...settings.motivational_messages];
                                                                    newMsgs[idx].message = e.target.value;
                                                                    updateNested('motivational_messages', newMsgs);
                                                                }}
                                                                className="h-11 bg-white rounded-xl border-slate-200"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'options' && (
                                <motion.div
                                    key="options"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                                >
                                    <ListCard
                                        title="Barrios de Argentina"
                                        items={settings.neighborhoods}
                                        onUpdate={(items) => updateNested('neighborhoods', items)}
                                        icon={MapPin}
                                    />
                                    <ListCard
                                        title="Ciudades / Zonas"
                                        items={settings.cities}
                                        onUpdate={(items) => updateNested('cities', items)}
                                        icon={Layout}
                                    />
                                    <ListCard
                                        title="Orígenes (Referencia)"
                                        items={settings.origins}
                                        onUpdate={(items) => updateNested('origins', items)}
                                        icon={Star}
                                    />
                                    <ListCard
                                        title="Motivos de Consulta"
                                        items={settings.reasons}
                                        onUpdate={(items) => updateNested('reasons', items)}
                                        icon={Check}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </main>
    );
}

function ListCard({ title, items, onUpdate, icon: Icon }: any) {
    const [newItem, setNewItem] = useState('');

    const addItem = () => {
        if (!newItem.trim()) return;
        onUpdate([...items, newItem.trim()]);
        setNewItem('');
    };

    const removeItem = (idx: number) => {
        const newItems = [...items];
        newItems.splice(idx, 1);
        onUpdate(newItems);
    };

    return (
        <Card className="p-8 rounded-[2.5rem] bg-white border border-slate-100 shadow-sm flex flex-col h-[500px]">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                    <Icon className="w-5 h-5" />
                </div>
                <h4 className="font-black text-slate-800 uppercase tracking-tighter">{title}</h4>
            </div>

            <div className="flex gap-2 mb-6">
                <Input
                    placeholder="Nuevo ítem..."
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addItem()}
                    className="h-11 bg-slate-50 border-none rounded-xl"
                />
                <Button onClick={addItem} className="h-11 w-11 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                    <Plus className="w-5 h-5" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {items.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 group">
                        <span className="text-sm font-bold text-slate-600">{item}</span>
                        <button
                            onClick={() => removeItem(idx)}
                            className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </Card>
    );
}
