'use client';

import { useState } from 'react';
import { ClipboardList, FlaskConical, Loader2, Plus, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import NuevoTrabajoForm from '@/components/laboratorio/NuevoTrabajoForm';
import type { LaboratorioTrabajo } from '@/lib/patients';

const supabase = createClient();

interface Props {
    patientId: string;
    patientName: string;
    initialTrabajos: LaboratorioTrabajo[];
}

function printOrder(patientName: string, trabajo: LaboratorioTrabajo) {
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
    const popup = window.open('', '_blank', 'width=800,height=900');
    if (!popup) {
        toast.error('El navegador bloqueó la ventana de impresión');
        return;
    }
    popup.document.write(`<!doctype html><html><head><title>Orden de laboratorio - ${escapeHtml(patientName)}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#172033}h1{font-size:24px;margin-bottom:4px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:8px}.meta{color:#667085;margin-bottom:28px}.box{border:1px solid #d0d5dd;border-radius:10px;padding:18px;white-space:pre-wrap;line-height:1.7}.row{display:flex;gap:30px;margin:10px 0}.label{color:#667085;font-size:12px;text-transform:uppercase}.value{font-weight:600}@media print{button{display:none}}</style></head><body><h1>Orden de laboratorio</h1><div class="meta">AM Clínica · ${escapeHtml(new Date(trabajo.fecha_envio).toLocaleDateString('es-AR'))}</div><h2>Paciente</h2><div class="value">${escapeHtml(patientName)}</div><h2>Trabajo solicitado</h2><div class="row"><div><div class="label">Tipo</div><div class="value">${escapeHtml(trabajo.tipo_trabajo)}</div></div><div><div class="label">Laboratorio</div><div class="value">${escapeHtml(trabajo.laboratorio_nombre || 'A definir')}</div></div></div><div class="box">${escapeHtml(trabajo.observaciones || 'Sin especificaciones técnicas')}</div><p style="margin-top:50px">Firma profesional: ________________________________</p><script>window.onload=function(){window.print()}</script></body></html>`);
    popup.document.close();
}

export default function PatientLaboratoryPanel({ patientId, patientName, initialTrabajos }: Props) {
    const [trabajos, setTrabajos] = useState(initialTrabajos);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);

    async function reload() {
        setLoading(true);
        const { data, error } = await supabase
            .from('laboratorio_trabajos')
            .select('id, paciente_id, profesional_id, tipo_trabajo, laboratorio_nombre, fecha_envio, fecha_entrega_estimada, fecha_entrega_real, estado, costo_usd, pagado, observaciones')
            .eq('paciente_id', patientId)
            .order('fecha_envio', { ascending: false });
        setLoading(false);
        if (error) {
            toast.error('No se pudo actualizar el laboratorio');
            return;
        }
        setTrabajos((data || []) as LaboratorioTrabajo[]);
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2"><ClipboardList size={18} className="text-indigo-600" /> Órdenes de laboratorio</h2>
                    <p className="text-sm text-gray-500">Registrá el trabajo técnico apenas termina el escaneado.</p>
                </div>
                <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">
                    <Plus size={16} /> Nueva orden
                </button>
            </div>

            {loading ? <div className="py-8 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={18} />Actualizando…</div> : trabajos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500"><FlaskConical size={34} className="mx-auto mb-2 text-gray-300" /><p>No hay órdenes de laboratorio para este paciente.</p></div>
            ) : trabajos.map(trabajo => (
                <article key={trabajo.id} className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div><p className="font-semibold text-gray-900 dark:text-white">{trabajo.tipo_trabajo}</p><p className="text-xs text-gray-500 mt-1">Enviada el {new Date(`${trabajo.fecha_envio}T12:00:00`).toLocaleDateString('es-AR')} · {trabajo.laboratorio_nombre || 'Laboratorio a definir'}</p></div>
                        <div className="flex items-center gap-2"><span className="px-2.5 py-1 rounded-full bg-white dark:bg-gray-900 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{trabajo.estado}</span><button type="button" onClick={() => printOrder(patientName, trabajo)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium hover:bg-white dark:hover:bg-gray-800"><Printer size={13} /> Imprimir</button></div>
                    </div>
                    {trabajo.observaciones && <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{trabajo.observaciones}</p>}
                </article>
            ))}

            <NuevoTrabajoForm isOpen={showForm} onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); void reload(); toast.success('Orden de laboratorio guardada'); }} initialPatient={{ id: patientId, name: patientName }} />
        </div>
    );
}
