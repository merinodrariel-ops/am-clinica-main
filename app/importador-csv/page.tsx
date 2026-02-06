'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, ChevronRight, Loader2 } from 'lucide-react';
import RoleGuard from '@/components/auth/RoleGuard';
import MainLayout from '@/components/MainLayout';

interface CSVRow {
    [key: string]: string;
}

interface MappedColumn {
    csvColumn: string;
    dbField: string;
}

interface ValidationError {
    row: number;
    column: string;
    message: string;
}

const DB_FIELDS = [
    { key: 'fecha_hora', label: 'Fecha', required: true },
    { key: 'paciente_nombre', label: 'Paciente (Nombre)', required: true },
    { key: 'concepto_nombre', label: 'Tratamiento/Concepto', required: true },
    { key: 'monto', label: 'Monto', required: true },
    { key: 'metodo_pago', label: 'Medio de Pago', required: false },
    { key: 'moneda', label: 'Moneda', required: false },
    { key: 'profesional', label: 'Profesional', required: false },
    { key: 'observaciones', label: 'Observaciones', required: false },
];

export default function ImportadorCSVPage() {
    const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvData, setCsvData] = useState<CSVRow[]>([]);
    const [mappings, setMappings] = useState<MappedColumn[]>([]);
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const parseCSV = useCallback((text: string) => {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) return { headers: [], data: [] };

        // Handle both comma and semicolon separators
        const separator = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separator).map(h => h.trim().replace(/^"|"$/g, ''));

        const data: CSVRow[] = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(separator).map(v => v.trim().replace(/^"|"$/g, ''));
            const row: CSVRow = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] || '';
            });
            data.push(row);
        }

        return { headers, data };
    }, []);

    const handleFileUpload = useCallback(async (uploadedFile: File) => {
        setFile(uploadedFile);
        setIsLoading(true);

        try {
            const text = await uploadedFile.text();
            const { headers, data } = parseCSV(text);

            setCsvHeaders(headers);
            setCsvData(data);

            // Auto-map columns if names match
            const autoMappings: MappedColumn[] = [];
            headers.forEach(header => {
                const normalizedHeader = header.toLowerCase().trim();
                const matchedField = DB_FIELDS.find(f =>
                    f.label.toLowerCase().includes(normalizedHeader) ||
                    normalizedHeader.includes(f.key.replace('_', ' '))
                );
                if (matchedField) {
                    autoMappings.push({ csvColumn: header, dbField: matchedField.key });
                }
            });
            setMappings(autoMappings);
            setStep('mapping');
        } catch (error) {
            console.error('Error parsing CSV:', error);
        } finally {
            setIsLoading(false);
        }
    }, [parseCSV]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.csv') || droppedFile.type === 'text/csv')) {
            handleFileUpload(droppedFile);
        }
    }, [handleFileUpload]);

    const updateMapping = (csvColumn: string, dbField: string) => {
        setMappings(prev => {
            const existing = prev.findIndex(m => m.csvColumn === csvColumn);
            if (existing >= 0) {
                if (!dbField) {
                    return prev.filter(m => m.csvColumn !== csvColumn);
                }
                const updated = [...prev];
                updated[existing] = { csvColumn, dbField };
                return updated;
            }
            return [...prev, { csvColumn, dbField }];
        });
    };

    const validateData = useCallback(() => {
        const errors: ValidationError[] = [];
        const dateMapping = mappings.find(m => m.dbField === 'fecha_hora');
        const montoMapping = mappings.find(m => m.dbField === 'monto');

        csvData.forEach((row, idx) => {
            // Validate date format
            if (dateMapping) {
                const dateValue = row[dateMapping.csvColumn];
                if (dateValue && !/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(dateValue)) {
                    errors.push({
                        row: idx + 2, // +2 for header and 1-based index
                        column: dateMapping.csvColumn,
                        message: `Formato de fecha inválido: "${dateValue}"`
                    });
                }
            }

            // Validate monto is numeric
            if (montoMapping) {
                const montoValue = row[montoMapping.csvColumn];
                const numericValue = parseFloat(montoValue.replace(/[,$]/g, '').replace(',', '.'));
                if (montoValue && isNaN(numericValue)) {
                    errors.push({
                        row: idx + 2,
                        column: montoMapping.csvColumn,
                        message: `Monto no numérico: "${montoValue}"`
                    });
                }
            }
        });

        setValidationErrors(errors);
        return errors.length === 0;
    }, [csvData, mappings]);

    const handleProceedToPreview = () => {
        validateData();
        setStep('preview');
    };

    const handleImport = async () => {
        setStep('importing');
        setIsLoading(true);

        try {
            const response = await fetch('/api/import-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: csvData,
                    mappings,
                    fileName: file?.name
                })
            });

            const result = await response.json();
            setImportResult(result);
            setStep('done');
        } catch (error) {
            console.error('Import error:', error);
            setImportResult({ success: 0, errors: csvData.length });
            setStep('done');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setStep('upload');
        setFile(null);
        setCsvHeaders([]);
        setCsvData([]);
        setMappings([]);
        setValidationErrors([]);
        setImportResult(null);
    };

    return (
        <RoleGuard allowedRoles={['admin', 'owner']}>
            <MainLayout>
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">Importador de Datos Históricos</h1>
                        <p className="text-gray-500 mt-2">
                            Importá registros desde archivos CSV exportados de Excel
                        </p>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center justify-center mb-8 gap-4">
                        {['Subir Archivo', 'Mapear Columnas', 'Previsualizar', 'Importar'].map((label, idx) => {
                            const stepIndex = ['upload', 'mapping', 'preview', 'importing'].indexOf(step);
                            const isActive = idx <= stepIndex || step === 'done';
                            return (
                                <div key={label} className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                                        }`}>
                                        {idx + 1}
                                    </div>
                                    <span className={`ml-2 text-sm ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                        {label}
                                    </span>
                                    {idx < 3 && <ChevronRight className="w-4 h-4 mx-2 text-gray-300" />}
                                </div>
                            );
                        })}
                    </div>

                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors bg-white"
                        >
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                                    <Upload className="w-8 h-8 text-blue-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Arrastrá tu archivo CSV aquí
                                </h3>
                                <p className="text-gray-500 mb-4">o hacé clic para seleccionar</p>
                                <label className="px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                                    Seleccionar archivo
                                    <input
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Mapping */}
                    {step === 'mapping' && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{file?.name}</h3>
                                        <p className="text-sm text-gray-500">{csvData.length} registros encontrados</p>
                                    </div>
                                </div>
                                <button onClick={handleReset} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <h4 className="text-lg font-medium text-gray-900 mb-4">Mapeo de Columnas</h4>
                            <p className="text-sm text-gray-500 mb-4">
                                Asociá cada columna del CSV con el campo correspondiente en el sistema
                            </p>

                            <div className="space-y-3">
                                {csvHeaders.map(header => {
                                    const currentMapping = mappings.find(m => m.csvColumn === header);
                                    return (
                                        <div key={header} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                            <span className="w-1/3 font-medium text-gray-700">{header}</span>
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                            <select
                                                value={currentMapping?.dbField || ''}
                                                onChange={(e) => updateMapping(header, e.target.value)}
                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">-- No importar --</option>
                                                {DB_FIELDS.map(field => (
                                                    <option key={field.key} value={field.key}>
                                                        {field.label} {field.required ? '*' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={handleReset}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleProceedToPreview}
                                    disabled={mappings.length === 0}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Continuar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Preview */}
                    {step === 'preview' && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">Vista Previa de Importación</h4>

                            {validationErrors.length > 0 && (
                                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                                        <AlertCircle className="w-5 h-5" />
                                        {validationErrors.length} advertencias encontradas
                                    </div>
                                    <ul className="text-sm text-amber-600 space-y-1">
                                        {validationErrors.slice(0, 5).map((err, idx) => (
                                            <li key={idx}>Fila {err.row}: {err.message}</li>
                                        ))}
                                        {validationErrors.length > 5 && (
                                            <li>...y {validationErrors.length - 5} más</li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="py-2 px-3 text-left text-gray-500 font-medium">#</th>
                                            {mappings.map(m => (
                                                <th key={m.dbField} className="py-2 px-3 text-left text-gray-500 font-medium">
                                                    {DB_FIELDS.find(f => f.key === m.dbField)?.label || m.dbField}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {csvData.slice(0, 10).map((row, idx) => {
                                            const rowErrors = validationErrors.filter(e => e.row === idx + 2);
                                            return (
                                                <tr key={idx} className={`border-b ${rowErrors.length ? 'bg-amber-50' : ''}`}>
                                                    <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                                                    {mappings.map(m => (
                                                        <td key={m.dbField} className="py-2 px-3 text-gray-700">
                                                            {row[m.csvColumn]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {csvData.length > 10 && (
                                <p className="text-sm text-gray-500 mt-3">
                                    Mostrando 10 de {csvData.length} registros
                                </p>
                            )}

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={() => setStep('mapping')}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleImport}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    Confirmar Importación
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Importing */}
                    {step === 'importing' && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900">Importando registros...</h3>
                            <p className="text-gray-500 mt-2">Por favor, no cierres esta página</p>
                        </div>
                    )}

                    {/* Step 5: Done */}
                    {step === 'done' && importResult && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${importResult.errors === 0 ? 'bg-green-100' : 'bg-amber-100'
                                }`}>
                                {importResult.errors === 0 ? (
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                ) : (
                                    <AlertCircle className="w-8 h-8 text-amber-600" />
                                )}
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                Importación Completada
                            </h3>
                            <p className="text-gray-500 mb-6">
                                {importResult.success} registros importados
                                {importResult.errors > 0 && ` • ${importResult.errors} errores`}
                            </p>
                            <div className="flex justify-center gap-3">
                                <button
                                    onClick={handleReset}
                                    className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                    Importar otro archivo
                                </button>
                                <a
                                    href="/caja-recepcion"
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Ir a Caja Recepción
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </MainLayout>
        </RoleGuard>
    );
}
