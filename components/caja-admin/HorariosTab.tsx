'use client';

import { useState } from 'react';
import { Settings, Upload, FileSpreadsheet, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { toast } from 'sonner';

export default function HorariosTab() {
    const [importPrompt, setImportPrompt] = useState(
        "Por favor procesa el siguiente CSV/Excel con los horarios del personal..."
    );
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Configuracion se guardaría normalmente en la BD, aquí usaré un fake delay para simular
    async function handleSaveConfig() {
        setIsSavingConfig(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 800));
            toast.success('Configuración guardada correctamente.');
        } catch (error) {
            toast.error('Error al guardar configuración.');
        } finally {
            setIsSavingConfig(false);
        }
    }

    async function handleImport() {
        // Here we would typically trigger an AI or parser function matching the user's config prompt
        setIsImporting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            toast.success('Horarios importados exitosamente.');
        } catch (error) {
            toast.error('Error al importar horarios.');
        } finally {
            setIsImporting(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-4">
                    <FileSpreadsheet className="w-6 h-6 text-blue-500" />
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Importador de Horarios</h3>
                        <p className="text-sm text-slate-500">Sube un Excel o Google Sheet para cargar los horarios automáticamente.</p>
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-center p-12 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={handleImport}>
                    <div className="text-center">
                        <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Haz clic para subir o arrastra tu archivo aquí
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            Acepta archivos .xlsx, .csv
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-4">
                    <Settings className="w-5 h-5 text-slate-500" />
                    <h4 className="font-semibold text-slate-900 dark:text-white">Configuración del Importador AI</h4>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                    Describe cómo debe el sistema interpretar el archivo subido. Personaliza el prompt a continuación.
                </p>
                <Textarea
                    className="min-h-[150px] font-mono text-sm"
                    value={importPrompt}
                    onChange={(e) => setImportPrompt(e.target.value)}
                />
                <div className="mt-4 flex justify-end">
                    <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                        {isSavingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Guardar Configuración
                    </Button>
                </div>
            </div>
        </div>
    );
}
