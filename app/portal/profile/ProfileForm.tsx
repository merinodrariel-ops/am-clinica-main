'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WorkerProfile } from '@/types/worker-portal';
import { Save, Upload, FileText, CheckCircle, AlertCircle, Trash2, Camera, ShieldCheck } from 'lucide-react';
import { uploadWorkerDocument, upsertWorkerProfile } from '@/app/actions/worker-portal';
import { toast } from 'sonner';

interface ProfileFormProps {
    worker: WorkerProfile;
}

export default function ProfileForm({ worker }: ProfileFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(type);
        try {
            await uploadWorkerDocument(worker.id, file, type);
            toast.success(`${type.replace('_', ' ').toUpperCase()} uploaded successfully`);
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error('Failed to upload document');
        } finally {
            setUploading(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        const formData = new FormData(e.currentTarget);

        try {
            await upsertWorkerProfile({
                id: worker.id,
                nombre: formData.get('nombre') as string,
                apellido: formData.get('apellido') as string,
                especialidad: formData.get('especialidad') as string,
                whatsapp: formData.get('whatsapp') as string,
            });
            toast.success('Profile updated successfully');
        } catch (error) {
            console.error('Update failed:', error);
            toast.error('Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    const docs = worker.documents as Record<string, any> || {};

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Basic Info */}
            <div className="lg:col-span-2 space-y-8">
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-xl">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                            <ShieldCheck className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Personal Information</h3>
                            <p className="text-slate-500 text-sm">Verified identification and contact details</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">First Name</label>
                                <Input
                                    name="nombre"
                                    defaultValue={worker.nombre}
                                    className="h-12 bg-slate-950/50 border-slate-800/50 focus:border-indigo-500/50 focus:ring-indigo-500/20 text-slate-200 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Last Name</label>
                                <Input
                                    name="apellido"
                                    defaultValue={worker.apellido}
                                    className="h-12 bg-slate-950/50 border-slate-800/50 focus:border-indigo-500/50 focus:ring-indigo-500/20 text-slate-200 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Specialty</label>
                                <Input
                                    name="especialidad"
                                    defaultValue={worker.especialidad}
                                    className="h-12 bg-slate-950/50 border-slate-800/50 focus:border-indigo-500/50 focus:ring-indigo-500/20 text-slate-200 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">WhatsApp</label>
                                <Input
                                    name="whatsapp"
                                    defaultValue={worker.whatsapp}
                                    placeholder="+54 9 11 ..."
                                    className="h-12 bg-slate-950/50 border-slate-800/50 focus:border-indigo-500/50 focus:ring-indigo-500/20 text-slate-200 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="pt-6 flex justify-end">
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-500/20 gap-2"
                            >
                                {isSaving ? 'Saving...' : (
                                    <>
                                        <Save size={18} />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </div>

                {/* Documents Grid */}
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                <FileText className="text-emerald-400" size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Compliance & Documents</h3>
                                <p className="text-slate-500 text-sm">Required legal and professional documentation</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DocumentCard
                            title="DNI (Front)"
                            type="dni_frente"
                            doc={docs['dni_frente']}
                            isUploading={uploading === 'dni_frente'}
                            onUpload={(e) => handleFileUpload(e, 'dni_frente')}
                        />
                        <DocumentCard
                            title="DNI (Back)"
                            type="dni_dorso"
                            doc={docs['dni_dorso']}
                            isUploading={uploading === 'dni_dorso'}
                            onUpload={(e) => handleFileUpload(e, 'dni_dorso')}
                        />
                        <DocumentCard
                            title="Professional License"
                            type="licencia"
                            doc={docs['licencia']}
                            isUploading={uploading === 'licencia'}
                            onUpload={(e) => handleFileUpload(e, 'licencia')}
                        />
                        <DocumentCard
                            title="Insurance Policy"
                            type="poliza"
                            doc={docs['poliza']}
                            isUploading={uploading === 'poliza'}
                            onUpload={(e) => handleFileUpload(e, 'poliza')}
                        />
                    </div>
                </div>
            </div>

            {/* Right Side: Profile Card & Status */}
            <div className="space-y-6">
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-[2.5rem] p-8 text-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-all"></div>

                    <div className="relative z-10">
                        <div className="relative inline-block mb-6">
                            <div className="w-32 h-32 rounded-full bg-slate-900 flex items-center justify-center border-4 border-slate-800 shadow-2xl overflow-hidden group-hover:border-indigo-500/30 transition-all">
                                {worker.foto_url ? (
                                    <img src={worker.foto_url} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-4xl text-slate-700 font-bold">{worker.nombre[0]}</span>
                                )}
                            </div>
                            <button className="absolute bottom-1 right-1 p-2.5 bg-indigo-600 rounded-2xl text-white hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/40 border-2 border-slate-950 scale-90 group-hover:scale-100">
                                <Camera size={16} />
                            </button>
                        </div>

                        <h4 className="text-2xl font-bold text-white tracking-tight">{worker.nombre} {worker.apellido}</h4>
                        <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest mt-1">{worker.rol}</p>

                        <div className="mt-8 pt-8 border-t border-slate-800/50 space-y-4">
                            <StatusBadge label="Compliance" status={Object.keys(docs).length >= 4 ? 'verified' : 'pending'} />
                            <StatusBadge label="Account" status="active" />
                        </div>
                    </div>
                </div>

                <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-8 backdrop-blur-xl">
                    <h5 className="text-indigo-300 font-bold text-sm mb-4">Contract Status</h5>
                    <div className="bg-indigo-950/30 rounded-2xl p-4 border border-indigo-500/10">
                        <div className="flex items-center gap-3">
                            <FileText size={20} className="text-indigo-400" />
                            <div>
                                <p className="text-slate-200 text-sm font-bold">Standard Agreement</p>
                                <p className="text-indigo-400/60 text-xs">Awaiting Signature</p>
                            </div>
                        </div>
                        <button className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl transition-all shadow-lg shadow-indigo-500/20">
                            Open & Sign
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DocumentCard({ title, type, doc, isUploading, onUpload }: { title: string, type: string, doc?: any, isUploading: boolean, onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
    const isVerified = doc?.status === 'verified';
    const isPending = doc?.status === 'pending_review';

    return (
        <div className={`p-5 rounded-2xl border transition-all ${isVerified ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-950/30 border-slate-800/50 hover:border-slate-700'}`}>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-300">{title}</span>
                {isVerified ? (
                    <CheckCircle className="text-emerald-400" size={18} />
                ) : isPending ? (
                    <AlertCircle className="text-amber-400" size={18} />
                ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                )}
            </div>

            {doc ? (
                <div className="flex items-center justify-between">
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline font-bold">View Document</a>
                    <button className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <input
                        type="file"
                        onChange={onUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={isUploading}
                    />
                    <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-500 bg-slate-900/50 border border-dashed border-slate-800 rounded-xl group-hover:border-slate-700">
                        {isUploading ? (
                            <span className="animate-pulse">Uploading...</span>
                        ) : (
                            <>
                                <Upload size={14} />
                                Upload File
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ label, status }: { label: string, status: string }) {
    return (
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{label}</span>
            <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${status === 'verified' || status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${status === 'verified' || status === 'active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {status}
                </span>
            </div>
        </div>
    );
}
