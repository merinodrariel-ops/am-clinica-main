import * as fs from 'fs';

const filePath = 'components/portal/ProsoftImporter.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// 1. imports
code = code.replace(
    /import \{\n    previewProsoftImportSafe, importProsoftDataSafe,\n    getAllPersonalBasic, saveProsoftMapping,\n    getProsoftMappings, deleteProsoftMapping,\n    ProsoftPreview,\n\} from '@\/app\/actions\/prosoft-import';/g,
    `import {
    previewProsoftFileSafe, importProsoftPreviewSafe,
    getAllPersonalBasic, saveProsoftMapping,
    getProsoftMappings, deleteProsoftMapping,
    ProsoftPreview,
} from '@/app/actions/prosoft-import';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';`
);

code = code.replace(
    /const \[url, setUrl\] = useState\(''\);/g,
    `const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);`
);

// 2. handlePreview replace
code = code.replace(
    /async function handlePreview\(\) \{[\s\S]*?finally \{\n            setLoading\(false\);\n        \}\n    \}/m,
    `async function handlePreview(selectedFile: File) {
        setLoading(true);
        setPreview(null);
        setResult(null);
        setPendingMaps({});
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const previewResult = await previewProsoftFileSafe(formData);
            if (!previewResult.success) {
                toast.error(previewResult.error);
                return;
            }

            const data = previewResult.data;
            setPreview(data);
            toast.success(\`\${data.totalRegistros} registros encontrados · \${mesLabel(data.mes)}\`);
        } catch (e: unknown) {
            toast.error(getFriendlyActionError(e, 'Error al leer la planilla'));
        } finally {
            setLoading(false);
        }
    }`
);

// 3. handleImport replace
code = code.replace(
    /async function handleImport\(\) \{[\s\S]*?finally \{\n            setImporting\(false\);\n        \}\n    \}/m,
    `async function handleImport() {
        if (!preview) return;
        setImporting(true);
        try {
            const importResult = await importProsoftPreviewSafe(preview, true);
            if (!importResult.success) {
                toast.error(importResult.error);
                return;
            }

            const res = importResult.data;
            setResult(res);
            const observed = preview.filas
                .filter((f) => f.personalId)
                .reduce((sum, f) => sum + f.registros.filter((r) => isObservedRecord(r)).length, 0);

            if (res.inserted > 0) {
                toast.success(\`✓ \${res.inserted} registros importados\`);
            } else {
                toast.info('No se importaron nuevos registros');
            }

            if (observed > 0) {
                toast.warning(\`\${observed} registros quedaron en estado Observado para resolución manual.\`);
            }
        } catch (e: unknown) {
            toast.error(getFriendlyActionError(e, 'Error al importar'));
        } finally {
            setImporting(false);
        }
    }`
);

// 4. Inputs Replace
const searchInputs = `{/* Inputs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                    onClick={handlePreview}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
                >
                    {loading
                        ? <RefreshCw size={14} className="animate-spin" />
                        : <Search size={14} />
                    }
                    Vista previa
                </button>
            </div>`;

const replaceInputs = `{/* Inputs Dropzone */}
            <div
                className={\`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl transition-colors \${
                    isDragging
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                }\`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) {
                        setFile(droppedFile);
                        handlePreview(droppedFile);
                    }
                }}
            >
                <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".csv, .xls, .xlsx"
                    onChange={(e) => {
                        const selectedFile = e.target.files?.[0];
                        if (selectedFile) {
                            setFile(selectedFile);
                            handlePreview(selectedFile);
                        }
                    }}
                />
                <div className="text-center pointer-events-none">
                    {loading ? (
                        <Loader2 className="w-10 h-10 animate-spin text-teal-500 mx-auto mb-4" />
                    ) : (
                        <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
                    )}
                    <p className="text-sm font-medium text-white">
                        {loading ? 'Procesando archivo...' : 'Haz clic para subir o arrastra tu archivo aquí'}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                        Acepta archivos .xls, .xlsx, .csv generados por Prosoft
                    </p>
                </div>
            </div>`;

code = code.replace(searchInputs, replaceInputs);

fs.writeFileSync(filePath, code);
console.log('Done!');
