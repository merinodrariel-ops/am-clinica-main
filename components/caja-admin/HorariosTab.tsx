'use client';

import { useState, useRef } from 'react';
import { Settings, Upload, FileSpreadsheet, Loader2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { toast } from 'sonner';
import { processHorariosFile } from '@/app/actions/importar-horarios-ai';

export default function HorariosTab() {
    const [importPrompt, setImportPrompt] = useState(
        "1. Identificar para cada persona las horas de ingreso y salida.\n2. Restar salida – ingreso (incluyendo casos donde la salida es después de medianoche).\n3. Generar una tabla ordenada con: Persona – Fecha – Horas trabajadas – Total por persona.\n4. Si la información viene en imagen, transcribí los valores antes del cálculo.\n5. Asigná el total de horas del período al final.\n\nAvisame si falta algún dato para completar los cálculos."
    );
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    async function handleFileSelection(file: File) {
        setIsImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('prompt', importPrompt);

            // Call AI Server Action
            const result = await processHorariosFile(formData);

            if (result.success) {
                toast.success(`Se prepararon ${result.insertedCount} registros de horarios. Mensaje de IA: ${result.message}`, { duration: 10000 });
            } else {
                toast.error('Error al procesar: ' + (result.error || result.message));
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al importar horarios con AI.');
        } finally {
            setIsImporting(false);
        }
    }

    async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        await handleFileSelection(file);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function onDragOver(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(true);
    }

    function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(false);
    }

    function onDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(false);
        if (isImporting) return;

        const file = e.dataTransfer.files?.[0];
        if (file) {
            handleFileSelection(file);
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

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".csv, .xls, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleImport}
                />
                <div
                    className={`mt-6 flex items-center justify-center p-12 border-2 border-dashed rounded-xl transition-colors cursor-pointer
                        ${isDragging
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }
                    `}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    <div className="text-center">
                        {isImporting ? (
                            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto mb-4" />
                        ) : (
                            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
                        )}
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {isImporting ? 'Procesando archivo con AI (puede demorar unos segundos)...' : 'Haz clic para subir o arrastra tu archivo aquí'}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            Acepta archivos .xls, .xlsx, .csv
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div
                    className="flex items-center justify-between mb-2 cursor-pointer select-none group"
                    onClick={() => setIsConfigOpen(!isConfigOpen)}
                >
                    <div className="flex items-center gap-3">
                        <Settings className="w-5 h-5 text-slate-500 group-hover:text-indigo-500 transition-colors" />
                        <h4 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">Configuración del Importador AI</h4>
                    </div>
                    <Button variant="ghost" size="sm" className="p-0 h-8 w-8">
                        {isConfigOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </Button>
                </div>

                {isConfigOpen && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-4 duration-200">
                        <p className="text-sm text-slate-500 mb-4">
                            Describe cómo debe el sistema interpretar el archivo subido. Personaliza el prompt a continuación.
                        </p>
                        <Textarea
                            className="min-h-[150px] font-mono text-sm leading-relaxed"
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
                )}
            </div>
        </div>
    );
}
