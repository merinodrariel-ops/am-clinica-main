'use client';

import { useState, useEffect } from 'react';
import { X, Send, Clock, MessageCircle, Mail, Star } from 'lucide-react';
import { toast } from 'sonner';
import { uploadEditedPhotoAction } from '@/app/actions/patient-files-drive';
import { schedulePatientMessageBatchAction, getPatientContactAction } from '@/app/actions/scheduled-messages';

const GOOGLE_REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ?? '';

export interface ShareWithPatientItem {
    id: string;
    name: string;
    driveFileId?: string;
    file?: File;
}

interface Props {
    files: ShareWithPatientItem[];
    patientId: string;
    patientName: string;
    folderId?: string;
    onClose: () => void;
}

function buildNextMorning(hour: number): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
}

function buildDefaultMessage(firstName: string, reviewUrl: string): string {
    const reviewLine = reviewUrl
        ? `\n\nSi podés, nos ayudás mucho compartiendo tu opinión 🌟\n${reviewUrl}`
        : '';
    return `Hola ${firstName}! 😊 Desde AM Clínica te enviamos las fotos de tu tratamiento. ¡Esperamos que estés feliz con el resultado!${reviewLine}\n\nCualquier consulta, escribinos. ¡Gracias por elegirnos! 🦷`;
}

export default function ShareWithPatientModal({ files, patientId, patientName, folderId, onClose }: Props) {
    const firstName = patientName.split(' ')[0] || patientName;
    const fileCount = files.length;
    const firstFileName = files[0]?.name ?? 'archivo';

    const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState(buildDefaultMessage(firstName, GOOGLE_REVIEW_URL));
    const [scheduleOption, setScheduleOption] = useState<'10' | '12' | 'custom'>('10');
    const [customDate, setCustomDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadingContact, setLoadingContact] = useState(true);

    useEffect(() => {
        getPatientContactAction(patientId).then(data => {
            if (data?.whatsapp) setPhone(data.whatsapp);
            if (data?.email) setEmail(data.email ?? '');
            setLoadingContact(false);
        });
    }, [patientId]);

    function getScheduledFor(): string {
        if (scheduleOption === '10') return buildNextMorning(10);
        if (scheduleOption === '12') return buildNextMorning(12);
        return customDate || buildNextMorning(10);
    }

    async function resolveMediaUrls() {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
        if (!appUrl) throw new Error('Falta NEXT_PUBLIC_APP_URL para compartir archivos');

        const mediaUrls: string[] = [];
        for (const item of files) {
            if (item.driveFileId) {
                mediaUrls.push(`${appUrl}/api/drive/file/${item.driveFileId}`);
                continue;
            }

            if (!item.file) continue;
            if (!folderId) throw new Error('No se encontró la carpeta de Drive para subir la imagen editada');

            const formData = new FormData();
            formData.append('file', item.file);
            const uploaded = await uploadEditedPhotoAction(folderId, item.name, formData);
            if (uploaded.error || !uploaded.fileId) throw new Error(uploaded.error ?? 'No se pudo subir la imagen editada');
            mediaUrls.push(`${appUrl}/api/drive/file/${uploaded.fileId}`);
        }

        return mediaUrls;
    }

    async function handleSchedule() {
        const contact = channel === 'whatsapp' ? phone : email;
        if (!contact.trim()) {
            toast.error(`Ingresá el ${channel === 'whatsapp' ? 'teléfono' : 'email'} del paciente`);
            return;
        }
        setSaving(true);
        try {
            const mediaUrls = await resolveMediaUrls();
            const result = await schedulePatientMessageBatchAction({
                patientId,
                channel,
                phone: channel === 'whatsapp' ? phone : undefined,
                email: channel === 'email' ? email : undefined,
                message,
                mediaUrls,
                scheduledFor: getScheduledFor(),
            });
            if (result.error) throw new Error(result.error);
            const when = scheduleOption === 'custom'
                ? new Date(customDate).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                : `mañana a las ${scheduleOption}:00 hs`;
            const scheduledCount = result.count ?? mediaUrls.length ?? 1;
            toast.success(`${scheduledCount} ${scheduledCount === 1 ? 'mensaje programado' : 'mensajes programados'} para ${when}`);
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al programar');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Compartir con el paciente</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">
                            {fileCount > 1 ? `${fileCount} fotos seleccionadas` : firstFileName}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Channel */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setChannel('whatsapp')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${channel === 'whatsapp' ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-green-300'}`}
                        >
                            <MessageCircle size={15} /> WhatsApp
                        </button>
                        <button
                            onClick={() => setChannel('email')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${channel === 'email' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300'}`}
                        >
                            <Mail size={15} /> Email
                        </button>
                    </div>

                    {/* Contact */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {channel === 'whatsapp' ? 'Teléfono WhatsApp' : 'Email'}
                        </label>
                        <input
                            type={channel === 'email' ? 'email' : 'tel'}
                            value={channel === 'whatsapp' ? phone : email}
                            onChange={e => channel === 'whatsapp' ? setPhone(e.target.value) : setEmail(e.target.value)}
                            placeholder={channel === 'whatsapp' ? '+549...' : 'paciente@email.com'}
                            disabled={loadingContact}
                            className="mt-1.5 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-400 disabled:opacity-50"
                        />
                    </div>

                    {/* Message */}
                    <div>
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                            {fileCount > 1 ? `Se programará un lote de ${fileCount} fotos para ${patientName}.` : `Se enviará 1 foto a ${patientName}.`}
                        </p>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mensaje</label>
                            {GOOGLE_REVIEW_URL && (
                                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                    <Star size={11} /> Incluye link de reseña
                                </span>
                            )}
                        </div>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={6}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-400 resize-none"
                        />
                    </div>

                    {/* Schedule */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock size={12} /> Programar envío
                        </label>
                        <div className="flex gap-2 mt-1.5">
                            {(['10', '12'] as const).map(h => (
                                <button
                                    key={h}
                                    onClick={() => setScheduleOption(h)}
                                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${scheduleOption === h ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}
                                >
                                    Mañana {h}:00
                                </button>
                            ))}
                            <button
                                onClick={() => setScheduleOption('custom')}
                                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${scheduleOption === 'custom' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}
                            >
                                Personalizar
                            </button>
                        </div>
                        {scheduleOption === 'custom' && (
                            <input
                                type="datetime-local"
                                value={customDate}
                                onChange={e => setCustomDate(e.target.value)}
                                className="mt-2 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-400"
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5">
                    <button
                        onClick={handleSchedule}
                        disabled={saving || loadingContact}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                        {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
                        Programar envío
                    </button>
                </div>
            </div>
        </div>
    );
}
