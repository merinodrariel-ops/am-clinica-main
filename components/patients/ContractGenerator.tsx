'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { checkCreditStatusAction, generateContractAction, SimulationData } from '@/app/actions/contracts';
import { Paciente } from '@/lib/patients';
import { toast } from 'sonner';
import {
    FileSignature,
    ShieldCheck,
    ShieldAlert,
    Calculator,
    ExternalLink,
    Loader2,
    CheckCircle2
} from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';

interface ContractGeneratorProps {
    patient: Paciente;
}

export default function ContractGenerator({ patient }: ContractGeneratorProps) {
    const [cuit, setCuit] = useState(patient.cuit || '');
    const [checkingCredit, setCheckingCredit] = useState(false);
    const [creditStatus, setCreditStatus] = useState<{ situation: number; message: string } | null>(null);
    const [generating, setGenerating] = useState(false);
    const [contractUrl, setContractUrl] = useState<string | null>(null);

    const [simData, setSimData] = useState<SimulationData>({
        tratamiento: '',
        montoTotal: 0,
        anticipo: 0,
        cuotas: 1,
        valorCuota: 0,
        vencimiento: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
    });

    // Auto-calculate valorCuota
    useEffect(() => {
        const aFinanciar = simData.montoTotal - simData.anticipo;
        if (aFinanciar > 0 && simData.cuotas > 0) {
            setSimData(prev => ({ ...prev, valorCuota: Math.round(aFinanciar / prev.cuotas) }));
        } else {
            setSimData(prev => ({ ...prev, valorCuota: 0 }));
        }
    }, [simData.montoTotal, simData.anticipo, simData.cuotas]);

    const handleCheckCredit = async () => {
        if (!cuit) {
            toast.error('Por favor ingresa un CUIT válido');
            return;
        }
        setCheckingCredit(true);
        try {
            const res = await checkCreditStatusAction(cuit);
            if (res.success) {
                setCreditStatus({ situation: res.situation, message: res.message });
            } else {
                toast.error(res.message);
            }
        } finally {
            setCheckingCredit(false);
        }
    };

    const handleGenerate = async () => {
        if (!simData.tratamiento) {
            toast.error('El tratamiento es requerido');
            return;
        }
        setGenerating(true);
        try {
            const res = await generateContractAction(patient.id_paciente, simData);
            if (res.success && res.url) {
                setContractUrl(res.url);
                toast.success('¡Contrato generado con éxito!');
            } else {
                toast.error(res.error || 'Error al generar contrato');
            }
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Phase 1: Identity & Credit */}
            <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="text-blue-600" size={24} />
                    <h3 className="text-lg font-bold">Verificación de Identidad y Crédito</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div className="space-y-2">
                        <Label>CUIT / CUIL del Paciente</Label>
                        <Input
                            value={cuit}
                            onChange={(e) => setCuit(e.target.value)}
                            placeholder="Sin guiones"
                        />
                    </div>
                    <Button
                        onClick={handleCheckCredit}
                        disabled={checkingCredit || !cuit}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {checkingCredit ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                        Verificar Situación BCRA
                    </Button>
                </div>

                {creditStatus && (
                    <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${creditStatus.situation === 1 ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                        {creditStatus.situation === 1 ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
                        <div>
                            <p className="font-bold">Situación: {creditStatus.situation}</p>
                            <p className="text-sm">{creditStatus.message}</p>
                        </div>
                    </div>
                )}
            </Card>

            {/* Phase 2: Simulation */}
            <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Calculator className="text-blue-600" size={24} />
                    <h3 className="text-lg font-bold">Simulación de Financiación</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Tratamiento Elegido</Label>
                            <Input
                                value={simData.tratamiento}
                                onChange={(e) => setSimData({ ...simData, tratamiento: e.target.value })}
                                placeholder="Ej: Ortodoncia Alineadores"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Monto Total (ARS)</Label>
                            <MoneyInput
                                value={simData.montoTotal}
                                onChange={(val) => setSimData({ ...simData, montoTotal: val })}
                                currency="ARS"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Anticipo (ARS)</Label>
                            <MoneyInput
                                value={simData.anticipo}
                                onChange={(val) => setSimData({ ...simData, anticipo: val })}
                                currency="ARS"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Cuotas</Label>
                                <Input
                                    type="number"
                                    value={simData.cuotas}
                                    onChange={(e) => setSimData({ ...simData, cuotas: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Vencimiento 1ra Cuota</Label>
                                <Input
                                    type="date"
                                    value={simData.vencimiento}
                                    onChange={(e) => setSimData({ ...simData, vencimiento: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Resultado</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span>A financiar:</span>
                                    <span className="font-medium">${(simData.montoTotal - simData.anticipo).toLocaleString('es-AR')}</span>
                                </div>
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Valor de cuota:</span>
                                    <span className="text-blue-600">${simData.valorCuota.toLocaleString('es-AR')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Phase 3: Generation */}
            <div className="flex flex-col gap-4">
                <Button
                    size="lg"
                    onClick={handleGenerate}
                    disabled={generating || !simData.tratamiento || !simData.montoTotal}
                    className="w-full h-16 text-xl bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center justify-center gap-3"
                >
                    {generating ? (
                        <Loader2 className="animate-spin" size={28} />
                    ) : (
                        <FileSignature size={28} />
                    )}
                    {generating ? 'Generando Documento...' : 'Generar Contrato Legal'}
                </Button>

                {contractUrl && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-100 p-2 rounded-full">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <p className="font-bold">Contrato Listo</p>
                                <p className="text-sm opacity-90">El documento se ha guardado en la carpeta del paciente.</p>
                            </div>
                        </div>
                        <a
                            href={contractUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                        >
                            Ver Documento <ExternalLink size={16} />
                        </a>
                    </motion.div>
                )}
            </div>
        </div>
    );
}

import { motion } from 'framer-motion';
