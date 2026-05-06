'use client';

import { useState, useEffect, Fragment, useCallback } from 'react';
import { Upload, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileSpreadsheet, UserCheck, UserX, Save, Link, Clock, Download, ChevronDown, ChevronUp, Trophy, Star, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    importProsoftPreviewSafe, previewProsoftFileSafe,
    getAllPersonalBasic, saveProsoftMapping,
    getProsoftMappings, deleteProsoftMapping,
    ProsoftPreview,
} from '@/app/actions/prosoft-import';
import { getRegistrosHorasMes, type RegistroHoras } from '@/app/actions/registro-horas';
import { parseProsoftXml } from '@/lib/prosoft-xml';

function mesLabel(ym: string) {
    const [y, m] = ym.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[parseInt(m) - 1]} ${y}`;
}

interface PersonalOption {
    id: string;
    nombre: string;
    apellido: string | null;
}

interface SavedMapping {
    raw_name: string;
    personal_id: string;
    nombre: string;
    apellido: string | null;
}

type ProsoftFila = ProsoftPreview['filas'][number];
type ProsoftRegistro = ProsoftFila['registros'][number];

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const DEFAULT_CALCULATION_PROMPT = `1. Identificar para cada persona las horas de ingreso y salida.

2. Restar salida - ingreso, incluyendo casos donde la salida es después de medianoche.

3. Generar una tabla ordenada con: Persona - Fecha - Horas trabajadas - Total por persona.

4. Si la información viene en imagen, transcribir los valores antes del cálculo.

5. Asignar el total de horas del período al final.

Reglas de control AM:
- Si una persona marca entrada por la tarde/noche y falta salida, y la primera marca del día siguiente es de madrugada (por ejemplo entre 00:00 y 05:00), interpretarla como salida tardía del día anterior, no como entrada nueva.
- En esos casos calcular la jornada cruzando medianoche y dejar asentado que la salida pertenece al día siguiente.
- Si en un mismo día hay 3 o más marcaciones, tomar la primera como ingreso y la última como egreso, omitiendo las marcaciones intermedias como movimientos internos o salidas breves.
- Solo dejar esas marcaciones múltiples como Observado si el resultado queda inválido o supera el máximo de horas configurado.
- Si falta entrada o salida, el fichaje queda Observado para corregir manualmente.
- Si la jornada supera el máximo configurado, queda Observado por horas excesivas.
- Las equivalencias ProSoft -> personal se guardan y se aplican automáticamente.`;

function norm(s: string) {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function scorePersonalMatch(rawName: string, person: PersonalOption) {
    const target = norm(rawName);
    const fullName = norm(`${person.nombre} ${person.apellido || ''}`);
    const reverseName = norm(`${person.apellido || ''} ${person.nombre}`);

    if (fullName === target || reverseName === target) return 100;
    if (fullName.includes(target) || target.includes(fullName)) return 80;
    if (reverseName.includes(target) || target.includes(reverseName)) return 80;
    const nombre = norm(person.nombre);
    if (nombre === target) return 70;
    if (target.includes(nombre)) return 60;
    return 0;
}

function applyClientMatches(
    preview: ProsoftPreview,
    allPersonal: PersonalOption[],
    savedMappings: SavedMapping[]
): ProsoftPreview {
    const byId = new Map(allPersonal.map((person) => [person.id, person]));
    const savedByRaw = new Map(savedMappings.map((mapping) => [mapping.raw_name, mapping.personal_id]));
    const sinMatch: string[] = [];

    const filas = preview.filas.map((fila) => {
        const mappedId = savedByRaw.get(fila.rawName);
        const mappedPerson = mappedId ? byId.get(mappedId) : undefined;
        if (mappedPerson) {
            return {
                ...fila,
                personalId: mappedPerson.id,
                personalNombre: `${mappedPerson.nombre} ${mappedPerson.apellido || ''}`.trim(),
            };
        }

        let bestMatch: PersonalOption | null = null;
        let bestScore = 0;

        for (const person of allPersonal) {
            const score = scorePersonalMatch(fila.rawName, person);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = person;
            }
        }

        if (bestMatch && bestScore >= 60) {
            return {
                ...fila,
                personalId: bestMatch.id,
                personalNombre: `${bestMatch.nombre} ${bestMatch.apellido || ''}`.trim(),
            };
        }

        sinMatch.push(fila.rawName);
        return {
            ...fila,
            personalId: null,
            personalNombre: '',
        };
    });

    return {
        ...preview,
        filas,
        sinMatch,
    };
}

function applyCalculationSettings(preview: ProsoftPreview, maxReviewHours: number): ProsoftPreview {
    if (!Number.isFinite(maxReviewHours) || maxReviewHours <= 0) return preview;

    return {
        ...preview,
        filas: preview.filas.map((fila) => ({
            ...fila,
            registros: fila.registros.map((registro) => {
                const shouldObserveByHours = !registro.incompleto && registro.horas > maxReviewHours;
                if (shouldObserveByHours) {
                    return {
                        ...registro,
                        requiereRevision: true,
                        motivoObservado: 'HorasExcesivas' as const,
                        observaciones: `Jornada superior al máximo configurado (${maxReviewHours}h)`,
                    };
                }

                const wasOnlyHoursThreshold =
                    registro.motivoObservado === 'HorasExcesivas' &&
                    registro.observaciones?.toLowerCase().includes('jornada');

                if (wasOnlyHoursThreshold && !registro.incompleto) {
                    return {
                        ...registro,
                        requiereRevision: false,
                        motivoObservado: undefined,
                        observaciones: undefined,
                    };
                }

                return registro;
            }),
        })),
    };
}

function isObservedStatus(status: string | null | undefined) {
    return String(status || '').toLowerCase() === 'observado';
}

function isResolvedRecord(row: RegistroHoras) {
    const status = String(row.estado || '').toLowerCase();
    return status === 'approved' || status === 'resuelto' || row.observaciones?.startsWith('[CORREGIDO]');
}

export default function ProsoftImporter({ mes }: { mes?: string }) {
    const now = new Date();
    const initialMes = mes || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState<ProsoftPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [activeMes, setActiveMes] = useState(initialMes);
    const [monthRows, setMonthRows] = useState<RegistroHoras[]>([]);
    const [monthLoading, setMonthLoading] = useState(false);

    // Manual mapping state
    const [allPersonal, setAllPersonal] = useState<PersonalOption[]>([]);
    const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
    const [pendingMaps, setPendingMaps] = useState<Record<string, string>>({}); // rawName → personalId
    const [savingMap, setSavingMap] = useState<string | null>(null);
    const [showMappings, setShowMappings] = useState(false);
    const [editingMapping, setEditingMapping] = useState<string | null>(null); // raw_name being edited
    const [editValue, setEditValue] = useState<string>(''); // personalId for edit
    const [showConfig, setShowConfig] = useState(true);
    const [calculationPrompt, setCalculationPrompt] = useState(DEFAULT_CALCULATION_PROMPT);
    const [maxReviewHours, setMaxReviewHours] = useState('14');

    const yearTabs = Array.from({ length: 12 }, (_, index) => `${activeMes.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`);

    const isObservedRecord = (r: { incompleto?: boolean; requiereRevision?: boolean }) => Boolean(r.incompleto || r.requiereRevision);

    const getFriendlyActionError = (error: unknown, fallback: string) => {
        const rawMessage = error instanceof Error ? error.message : '';
        return rawMessage || fallback;
    };

    const loadMonthSummary = useCallback(async (targetMes: string) => {
        setMonthLoading(true);
        try {
            const rows = await getRegistrosHorasMes(targetMes);
            setMonthRows(rows);
        } catch {
            toast.error('No se pudo cargar el resumen mensual de horarios');
        } finally {
            setMonthLoading(false);
        }
    }, []);

    function getObservedRows() {
        if (!preview) return [];
        return preview.filas
            .filter((fila) => fila.personalId)
            .flatMap((fila) => fila.registros
                .filter((registro) => isObservedRecord(registro))
                .map((registro) => ({
                    rawName: fila.rawName,
                    personalId: fila.personalId,
                    personalNombre: fila.personalNombre,
                    fecha: registro.fecha,
                    entrada: registro.entrada,
                    salida: registro.salida,
                    horas: registro.horas,
                    motivo: registro.motivoObservado || 'Otro',
                    observaciones: registro.observaciones || '',
                })));
    }

    function getObservedUrl(personalId?: string | null) {
        const params = new URLSearchParams();
        params.set('tab', 'personal');
        params.set('subtab', 'observados');
        params.set('observado_mes', activeMes);
        if (personalId) params.set('observado_personal_id', personalId);
        return `/caja-admin?${params.toString()}`;
    }

    function getProviderHoursUrl(personalId: string) {
        const params = new URLSearchParams();
        params.set('tab', 'personal');
        params.set('subtab', 'equipo');
        params.set('horas_personal_id', personalId);
        params.set('horas_mes', activeMes);
        return `/caja-admin?${params.toString()}`;
    }

    function openObservedCorrections(personalId?: string | null) {
        window.location.href = getObservedUrl(personalId);
    }

    useEffect(() => {
        getAllPersonalBasic().then(setAllPersonal).catch(() => { });
        getProsoftMappings().then(setSavedMappings).catch(() => { });
    }, []);

    useEffect(() => {
        if (mes && /^\d{4}-\d{2}$/.test(mes)) {
            setActiveMes(mes);
        }
    }, [mes]);

    useEffect(() => {
        loadMonthSummary(activeMes);
    }, [activeMes, loadMonthSummary]);

    useEffect(() => {
        try {
            const savedPrompt = window.localStorage.getItem('prosoftCalculationPrompt');
            const savedMax = window.localStorage.getItem('prosoftMaxReviewHours');
            if (savedPrompt) setCalculationPrompt(savedPrompt);
            if (savedMax) setMaxReviewHours(savedMax);
        } catch { }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem('prosoftCalculationPrompt', calculationPrompt);
            window.localStorage.setItem('prosoftMaxReviewHours', maxReviewHours);
        } catch { }
    }, [calculationPrompt, maxReviewHours]);

    useEffect(() => {
        if (allPersonal.length === 0) return;
        setPreview((current) => {
            if (!current) return current;
            return applyCalculationSettings(
                applyClientMatches(current, allPersonal, savedMappings),
                Number(maxReviewHours.replace(',', '.'))
            );
        });
    }, [allPersonal, savedMappings, maxReviewHours]);

    async function handlePreview(selectedFile: File) {
        setLoading(true);
        setPreview(null);
        setResult(null);
        setPendingMaps({});
        try {
            const lowerName = selectedFile.name.toLowerCase();
            const isXml = lowerName.endsWith('.xml');
            const isSpreadsheet = /\.(csv|xls|xlsx|xlm)$/.test(lowerName);

            if (!isXml && !isSpreadsheet) {
                throw new Error('Subí un archivo ProSoft en formato XML, CSV, XLS, XLSX o XLM.');
            }

            if (isXml) {
                const xmlText = await selectedFile.text();
                const data = applyCalculationSettings(
                    applyClientMatches(parseProsoftXml(xmlText) as ProsoftPreview, allPersonal, savedMappings),
                    Number(maxReviewHours.replace(',', '.'))
                );
                setPreview(data);
                setActiveMes(data.mes);
                toast.success(`${data.totalRegistros} registros encontrados · ${mesLabel(data.mes)}`);
                return;
            }

            const formData = new FormData();
            formData.append('file', selectedFile);
            const res = await previewProsoftFileSafe(formData, activeMes);
            if (!res.success) {
                throw new Error(res.error);
            }

            const data = applyCalculationSettings(
                applyClientMatches(res.data, allPersonal, savedMappings),
                Number(maxReviewHours.replace(',', '.'))
            );
            setPreview(data);
            setActiveMes(data.mes);
            toast.success(`${data.totalRegistros} registros encontrados · ${mesLabel(data.mes)}`);
        } catch (e: unknown) {
            toast.error(getFriendlyActionError(e, 'Error al leer el archivo ProSoft'));
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
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
            setActiveMes(preview.mes);
            loadMonthSummary(preview.mes);
            const observed = preview.filas
                .filter((f) => f.personalId)
                .reduce((sum, f) => sum + f.registros.filter((r) => isObservedRecord(r)).length, 0);

            if (res.inserted > 0) {
                toast.success(`✓ ${res.inserted} registros importados`);
            } else {
                toast.info('No se importaron nuevos registros');
            }

            if (observed > 0) {
                toast.warning(`${observed} registros quedaron en Observados para corregir`, {
                    action: {
                        label: 'Corregir ahora',
                        onClick: () => openObservedCorrections(),
                    },
                    duration: 10000,
                });
            }
        } catch (e: unknown) {
            toast.error(getFriendlyActionError(e, 'Error al importar'));
        } finally {
            setImporting(false);
        }
    }

    async function handleSaveMapping(rawName: string) {
        const personalId = pendingMaps[rawName];
        if (!personalId) { toast.error('Seleccioná un prestador'); return; }
        setSavingMap(rawName);
        try {
            const res = await saveProsoftMapping(rawName, personalId);
            if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
            toast.success('Equivalencia guardada');
            const fresh = await getProsoftMappings();
            setSavedMappings(fresh);
            setPreview((current) => current ? applyClientMatches(current, allPersonal, fresh) : current);
        } catch {
            toast.error('Error al guardar equivalencia');
        } finally {
            setSavingMap(null);
        }
    }

    async function handleDeleteMapping(rawName: string) {
        await deleteProsoftMapping(rawName);
        const nextMappings = savedMappings.filter(m => m.raw_name !== rawName);
        setSavedMappings(nextMappings);
        setPreview((current) => current ? applyClientMatches(current, allPersonal, nextMappings) : current);
        toast.success('Equivalencia eliminada');
    }

    async function handleEditMapping(rawName: string) {
        if (!editValue) { toast.error('Seleccioná un prestador'); return; }
        setSavingMap(rawName);
        try {
            const res = await saveProsoftMapping(rawName, editValue);
            if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
            toast.success('Equivalencia actualizada');
            const fresh = await getProsoftMappings();
            setSavedMappings(fresh);
            setPreview((current) => current ? applyClientMatches(current, allPersonal, fresh) : current);
            setEditingMapping(null);
        } catch {
            toast.error('Error al actualizar');
        } finally {
            setSavingMap(null);
        }
    }

    function exportToCsv() {
        if (!preview) return;

        const headers = ["Prestador", "Días", "Total Horas", "Prom/Día", "Horario Típico"];
        const rows = matchedRows.map(f => {
            const complete = f.registros.filter(r => !isObservedRecord(r));
            const totalH = complete.reduce((s, r) => s + r.horas, 0);
            const dias = f.registros.length;
            const ingresos = complete.filter(r => r.entrada !== '00:00').map(r => r.entrada).sort();
            const egresos = complete.filter(r => r.salida !== '00:00').map(r => r.salida).sort();
            const horaRango = ingresos.length > 0 ? `${ingresos[0]} - ${egresos.at(-1)}` : '—';

            return [
                f.personalNombre,
                dias,
                Math.round(totalH * 10) / 10,
                dias > 0 ? Math.round(totalH / dias * 10) / 10 : 0,
                horaRango
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(c => `"${c}"`).join(','))
        ].join('\n');

        downloadCsv(csvContent, `resumen_horas_${preview.mes}.csv`);
    }

    function exportDetailedCsv() {
        if (!preview) return;

        const headers = ["Prestador", "Fecha", "Día", "Entrada", "Salida", "Horas", "Estado", "Notas"];
        const rows: Array<Array<string | number>> = [];

        matchedRows.forEach(f => {
            f.registros.forEach(r => {
                rows.push([
                    f.personalNombre,
                    `${preview.mes}-${String(r.dia).padStart(2, '0')}`,
                    r.dia,
                    r.entrada,
                    r.salida,
                    r.horas,
                    isObservedRecord(r) ? 'Observado' : 'Ok',
                    r.observaciones || ''
                ]);
            });
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map((c) => `"${c}"`).join(','))
        ].join('\n');

        downloadCsv(csvContent, `detalle_diario_horas_${preview.mes}.csv`);
    }

    function downloadCsv(content: string, filename: string) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function exportMonthSummaryCsv() {
        const headers = ['Prestador', 'Mes', 'Dias', 'Total horas', 'Pendientes', 'Corregidos'];
        const rows = monthPeopleRows.map((row) => [
            row.nombre,
            activeMes,
            row.dias,
            Math.round(row.horas * 10) / 10,
            row.pendientes,
            row.resueltos,
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');

        downloadCsv(csvContent, `informe_horas_prosoft_${activeMes}.csv`);
    }

    function printMonthSummary() {
        const totalHours = Math.round(monthTotalHours * 10) / 10;
        const rowsHtml = monthPeopleRows.map((row) => `
            <tr>
                <td>${row.nombre}</td>
                <td>${row.dias}</td>
                <td>${Math.round(row.horas * 10) / 10}h</td>
                <td>${row.pendientes}</td>
                <td>${row.resueltos}</td>
            </tr>
        `).join('');

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Informe ProSoft ${mesLabel(activeMes)}</title>
                    <style>
                        body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
                        h1 { margin: 0 0 4px; font-size: 22px; }
                        p { margin: 0; color: #4b5563; }
                        .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 22px 0; }
                        .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
                        .value { font-size: 18px; font-weight: 700; color: #0f766e; }
                        .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
                        table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
                        th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
                        th { background: #f3f4f6; color: #374151; }
                    </style>
                </head>
                <body>
                    <h1>Informe ProSoft</h1>
                    <p>${mesLabel(activeMes)}</p>
                    <div class="cards">
                        <div class="card"><div class="value">${monthPeopleRows.length}</div><div class="label">Prestadores</div></div>
                        <div class="card"><div class="value">${totalHours}h</div><div class="label">Horas cargadas</div></div>
                        <div class="card"><div class="value">${monthPendingObserved}</div><div class="label">Pendientes</div></div>
                        <div class="card"><div class="value">${monthResolved}</div><div class="label">Corregidos</div></div>
                    </div>
                    <table>
                        <thead>
                            <tr><th>Prestador</th><th>Días</th><th>Total horas</th><th>Pendientes</th><th>Corregidos</th></tr>
                        </thead>
                        <tbody>${rowsHtml || '<tr><td colspan="5">Sin horarios importados para este mes.</td></tr>'}</tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    function getBadges(f: ProsoftFila) {
        const badges: Array<{ icon: React.JSX.Element; label: string; bg: string }> = [];
        const complete = f.registros.filter((r) => !isObservedRecord(r));
        const totalH = complete.reduce((s, r) => s + r.horas, 0);
        const hasIncomplete = f.registros.some((r) => isObservedRecord(r));
        const daysWorked = f.registros.length;

        // Merit-based criteria:
        // 1. Asistencia Perfecta: Full month (22+ days) AND zero incomplete records
        if (!hasIncomplete && daysWorked >= 22) {
            badges.push({
                icon: <Trophy size={10} className="text-yellow-400" />,
                label: 'Asistencia Perfecta',
                bg: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
            });
        }
        // 2. Alto Rendimiento: Very high total hours (>170h)
        if (totalH >= 170) {
            badges.push({
                icon: <Sparkles size={10} className="text-purple-400" />,
                label: 'Alto Rendimiento',
                bg: 'bg-purple-500/10 border-purple-500/20 text-purple-500'
            });
        }
        // 3. Constancia: Worked at least 20 days with no errors, but didn't reach 170h
        if (!hasIncomplete && daysWorked >= 20 && totalH < 170 && badges.length === 0) {
            badges.push({
                icon: <Star size={10} className="text-blue-400" />,
                label: 'Constancia',
                bg: 'bg-blue-500/10 border-blue-500/20 text-blue-500'
            });
        }
        return badges;
    }

    const matchedRows = preview?.filas.filter(f => f.personalId) ?? [];
    const unmatchedRows = preview?.filas.filter(f => !f.personalId) ?? [];
    const observedCount = matchedRows.reduce(
        (sum, f) => sum + f.registros.filter((r) => isObservedRecord(r)).length,
        0
    );
    const observedRows = getObservedRows();
    const monthTotalHours = monthRows.reduce((sum, row) => sum + (Number(row.horas) || 0), 0);
    const monthPendingObserved = monthRows.filter((row) => isObservedStatus(row.estado) && !isResolvedRecord(row)).length;
    const monthResolved = monthRows.filter(isResolvedRecord).length;
    const monthPeople = new Map<string, {
        personalId: string;
        nombre: string;
        dias: number;
        horas: number;
        pendientes: number;
        resueltos: number;
    }>();

    for (const row of monthRows) {
        const current = monthPeople.get(row.personal_id) || {
            personalId: row.personal_id,
            nombre: `${row.personal?.nombre || 'Sin nombre'} ${row.personal?.apellido || ''}`.trim(),
            dias: 0,
            horas: 0,
            pendientes: 0,
            resueltos: 0,
        };
        current.dias += 1;
        current.horas += Number(row.horas) || 0;
        if (isObservedStatus(row.estado) && !isResolvedRecord(row)) current.pendientes += 1;
        if (isResolvedRecord(row)) current.resueltos += 1;
        monthPeople.set(row.personal_id, current);
    }

    const monthPeopleRows = Array.from(monthPeople.values())
        .sort((a, b) => b.horas - a.horas);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500/10 rounded-xl border border-teal-500/20">
                        <FileSpreadsheet size={18} className="text-teal-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">Importar horas ProSoft</h2>
                        <p className="text-xs text-slate-400">Arrastrá el archivo XML, XLS, XLSX o CSV exportado desde ProSoft</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowMappings(!showMappings)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                    <Link size={12} />
                    Equivalencias ({savedMappings.length})
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">Horarios importados por mes</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Seleccioná un mes para ver acá mismo lo importado, lo corregido y lo pendiente.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {yearTabs.map((tabMes, index) => {
                                const selected = tabMes === activeMes;
                                return (
                                    <button
                                        key={tabMes}
                                        type="button"
                                        onClick={() => setActiveMes(tabMes)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                                            selected
                                                ? 'bg-teal-500/15 border-teal-500/40 text-teal-200'
                                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                                        }`}
                                    >
                                        <span className="hidden sm:inline">{MONTH_NAMES[index]}</span>
                                        <span className="sm:hidden">{MONTH_NAMES_SHORT[index]}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">{mesLabel(activeMes)}</p>
                            <p className="text-xs text-slate-500">
                                {monthLoading ? 'Cargando horarios guardados...' : `${monthRows.length} registros guardados`}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={exportMonthSummaryCsv}
                                disabled={monthPeopleRows.length === 0}
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
                            >
                                <Download size={12} />
                                Descargar CSV
                            </button>
                            <button
                                type="button"
                                onClick={printMonthSummary}
                                disabled={monthPeopleRows.length === 0}
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 text-xs font-semibold transition-colors"
                            >
                                <FileSpreadsheet size={12} />
                                PDF / imprimir
                            </button>
                            {monthPendingObserved > 0 && (
                                <button
                                    type="button"
                                    onClick={() => openObservedCorrections()}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
                                >
                                    <AlertTriangle size={12} />
                                    Corregir {monthPendingObserved} pendiente{monthPendingObserved > 1 ? 's' : ''}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'Prestadores', value: monthPeopleRows.length, color: 'text-teal-400' },
                            { label: 'Horas cargadas', value: `${Math.round(monthTotalHours * 10) / 10}h`, color: 'text-violet-400' },
                            { label: 'Pendientes', value: monthPendingObserved, color: monthPendingObserved > 0 ? 'text-amber-400' : 'text-slate-400' },
                            { label: 'Corregidos', value: monthResolved, color: 'text-emerald-400' },
                        ].map((item) => (
                            <div key={item.label} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
                            </div>
                        ))}
                    </div>

                    {monthPeopleRows.length === 0 ? (
                        <div className="border border-dashed border-slate-800 rounded-xl px-4 py-6 text-center">
                            <p className="text-sm text-slate-300">Todavía no hay horarios importados para {mesLabel(activeMes)}.</p>
                            <p className="text-xs text-slate-500 mt-1">Cuando importes un archivo de ese período, el resumen va a aparecer acá.</p>
                        </div>
                    ) : (
                        <div className="border border-slate-800 rounded-xl overflow-hidden">
                            <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-950">
                                        <tr className="border-b border-slate-800 text-slate-400">
                                            <th className="px-4 py-2 text-left font-medium">Prestador</th>
                                            <th className="px-3 py-2 text-center font-medium">Días</th>
                                            <th className="px-3 py-2 text-right font-medium">Horas</th>
                                            <th className="px-3 py-2 text-center font-medium">Estado</th>
                                            <th className="px-3 py-2 text-right font-medium">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {monthPeopleRows.map((row) => (
                                            <tr key={row.personalId} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <a
                                                        href={getProviderHoursUrl(row.personalId)}
                                                        className="text-white font-medium hover:text-teal-300 underline-offset-2 hover:underline"
                                                        title="Abrir dashboard de horas del prestador"
                                                    >
                                                        {row.nombre}
                                                    </a>
                                                </td>
                                                <td className="px-3 py-2.5 text-center text-slate-300">{row.dias}</td>
                                                <td className="px-3 py-2.5 text-right text-teal-300 font-semibold">{Math.round(row.horas * 10) / 10}h</td>
                                                <td className="px-3 py-2.5 text-center">
                                                    {row.pendientes > 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                                                            <Clock size={10} />
                                                            {row.pendientes} pendiente{row.pendientes > 1 ? 's' : ''}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                                                            <CheckCircle2 size={10} />
                                                            OK
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right">
                                                    {row.pendientes > 0 ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <a
                                                                href={getProviderHoursUrl(row.personalId)}
                                                                className="text-[11px] font-medium text-teal-300 hover:text-teal-200 underline underline-offset-2"
                                                            >
                                                                Ver
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => openObservedCorrections(row.personalId)}
                                                                className="text-[11px] font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2"
                                                            >
                                                                Corregir
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <a
                                                            href={getProviderHoursUrl(row.personalId)}
                                                            className="text-[11px] font-medium text-teal-300 hover:text-teal-200 underline underline-offset-2"
                                                        >
                                                            Ver dashboard
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Saved mappings panel */}
            {showMappings && (
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                        <p className="text-xs font-medium text-slate-300">Equivalencias guardadas (se aplican automáticamente)</p>
                    </div>
                    {savedMappings.length === 0 ? (
                        <p className="text-xs text-slate-500 px-4 py-3">No hay equivalencias guardadas aún.</p>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {savedMappings.map(m => (
                                <div key={m.raw_name} className="px-4 py-2.5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 text-xs min-w-0">
                                            <span className="text-amber-300 font-mono truncate">{m.raw_name}</span>
                                            <span className="text-slate-500 flex-shrink-0">→</span>
                                            <span className="text-emerald-400 flex-shrink-0">{m.nombre} {m.apellido || ''}</span>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                                            <button
                                                onClick={() => {
                                                    setEditingMapping(editingMapping === m.raw_name ? null : m.raw_name);
                                                    setEditValue(m.personal_id);
                                                }}
                                                className="text-xs text-slate-400 hover:text-teal-400 transition-colors"
                                            >
                                                {editingMapping === m.raw_name ? 'Cancelar' : 'Editar'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMapping(m.raw_name)}
                                                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                    {editingMapping === m.raw_name && (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                                            >
                                                <option value="">— Seleccionar —</option>
                                                {allPersonal.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleEditMapping(m.raw_name)}
                                                disabled={savingMap === m.raw_name}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                                            >
                                                {savingMap === m.raw_name ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                                                Guardar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Inputs Dropzone */}
            <div
                className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl transition-colors ${
                    isDragging
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                }`}
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
                    accept=".xml,.xls,.xlsx,.xlm,.csv,text/xml,application/xml,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
                        Acepta `.xml`, `.xls`, `.xlsx`, `.xlm` y `.csv`
                    </p>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <button
                    type="button"
                    onClick={() => setShowConfig(!showConfig)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
                >
                    <div>
                        <p className="text-sm font-semibold text-white">Configuración de cálculo</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Reglas guardadas para interpretar horarios y decidir qué queda Observado.
                        </p>
                    </div>
                    {showConfig ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </button>

                {showConfig && (
                    <div className="border-t border-slate-800 p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                            <label className="block">
                                <span className="block text-xs font-medium text-slate-400 mb-1">Prompt operativo</span>
                                <textarea
                                    value={calculationPrompt}
                                    onChange={(e) => setCalculationPrompt(e.target.value)}
                                    rows={7}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                                />
                            </label>
                            <div className="space-y-3">
                                <label className="block">
                                    <span className="block text-xs font-medium text-slate-400 mb-1">Máx. horas sin observar</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="24"
                                        step="0.25"
                                        value={maxReviewHours}
                                        onChange={(e) => setMaxReviewHours(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCalculationPrompt(DEFAULT_CALCULATION_PROMPT);
                                        setMaxReviewHours('14');
                                    }}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    Restaurar reglas base
                                </button>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    Las equivalencias de nombres se manejan desde Equivalencias. Los fichajes con entrada/salida faltante se importan como Observado para ajuste manual.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {preview && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 font-medium">
                        Período detectado: {mesLabel(preview.mes)}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-300">
                        {preview.periodoDesde} → {preview.periodoHasta}
                    </span>
                    {!preview.periodoDetectado && (
                        <span className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                            Período inferido por estructura (sin cabecera Prosoft)
                        </span>
                    )}
                </div>
            )}

            {/* Preview */}
            {preview && !result && (
                <div className="space-y-4">
                    {/* Summary bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-emerald-400">{matchedRows.length}</p>
                            <p className="text-xs text-slate-400">Prestadores encontrados</p>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-white">{preview.totalRegistros}</p>
                            <p className="text-xs text-slate-400">Registros del XML</p>
                        </div>
                        <div className={`border rounded-xl p-3 text-center ${unmatchedRows.length > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-800 border-slate-700'}`}>
                            <p className={`text-lg font-bold ${unmatchedRows.length > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                {unmatchedRows.length}
                            </p>
                            <p className="text-xs text-slate-400">Sin coincidencia</p>
                        </div>
                    </div>

                    {observedCount > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                            <p className="text-xs text-amber-200 font-medium flex items-center gap-2">
                                <AlertTriangle size={13} className="text-amber-400" />
                                Se detectaron {observedCount} fichajes con conflicto o faltantes. Se importarán como <strong className="text-amber-300">Observado</strong> para corrección manual.
                            </p>
                            <p className="text-[11px] text-amber-300/90 mt-1">
                                Luego resolvelos en Caja Administración → Personal → Observados (dejando evidencia y motivo en cada ajuste).
                            </p>
                            <a
                                href={getObservedUrl()}
                                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-amber-200 hover:text-amber-100 underline underline-offset-2"
                            >
                                Abrir Observados ahora
                            </a>
                        </div>
                    )}

                    {/* Manual mapping for unmatched */}
                    {unmatchedRows.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-amber-500/20">
                                <p className="text-xs font-medium text-amber-300 flex items-center gap-2">
                                    <AlertTriangle size={13} />
                                    {unmatchedRows.length} nombre{unmatchedRows.length > 1 ? 's' : ''} sin coincidencia — asignales un prestador y guardá
                                </p>
                            </div>
                            <div className="divide-y divide-amber-500/10">
                                {unmatchedRows.map(fila => (
                                    <div key={fila.rawName} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <UserX size={14} className="text-amber-400 flex-shrink-0" />
                                            <span className="text-sm text-amber-200 font-mono truncate">{fila.rawName}</span>
                                        </div>
                                        <div className="flex items-center gap-2 sm:w-auto">
                                            <select
                                                value={pendingMaps[fila.rawName] || ''}
                                                onChange={e => setPendingMaps(prev => ({ ...prev, [fila.rawName]: e.target.value }))}
                                                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500 min-w-[200px]"
                                            >
                                                <option value="">— Seleccionar prestador —</option>
                                                {allPersonal.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleSaveMapping(fila.rawName)}
                                                disabled={!pendingMaps[fila.rawName] || savingMap === fila.rawName}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                                            >
                                                {savingMap === fila.rawName
                                                    ? <RefreshCw size={11} className="animate-spin" />
                                                    : <Save size={11} />
                                                }
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Employee list */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                        {matchedRows.map((fila) => {
                            const incomplete = fila.registros.filter(r => isObservedRecord(r)).length;
                            return (
                                <div key={fila.rawName} className="border-b border-slate-800/50 last:border-0">
                                    <button
                                        onClick={() => setExpandedRow(expandedRow === fila.rawName ? null : fila.rawName)}
                                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2">
                                                {expandedRow === fila.rawName ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                                                <UserCheck size={14} className="text-emerald-400 flex-shrink-0" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm text-white font-medium">{fila.rawName}</p>
                                                    <div className="flex items-center gap-1">
                                                        {getBadges(fila).map((b, i) => (
                                                            <span key={i} title={b.label} className={`flex items-center p-0.5 rounded-full border ${b.bg}`}>
                                                                {b.icon}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-400">→ {fila.personalNombre}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {incomplete > 0 && (
                                                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                                                    <Clock size={9} /> {incomplete} incompleto{incomplete > 1 ? 's' : ''}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-500">{fila.registros.length} días</span>
                                            {fila.personalId && (
                                                <span
                                                    role="link"
                                                    tabIndex={0}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        window.location.href = getProviderHoursUrl(fila.personalId!);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        window.location.href = getProviderHoursUrl(fila.personalId!);
                                                    }}
                                                    className="text-[11px] font-medium text-teal-300 hover:text-teal-200 underline underline-offset-2"
                                                >
                                                    Ver prestador
                                                </span>
                                            )}
                                        </div>
                                    </button>

                                    {expandedRow === fila.rawName && (
                                        <div className="px-4 pb-4">
                                            <div className="bg-slate-950/50 border border-slate-800/80 rounded-lg overflow-hidden">
                                                <div className="p-2 border-b border-slate-800/80 bg-slate-900/30">
                                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Cronología de Asistencia</p>
                                                </div>
                                                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="sticky top-0 bg-slate-900 shadow-sm z-10">
                                                            <tr className="border-b border-slate-800 text-slate-400">
                                                                <th className="px-3 py-2 text-left font-medium">Día</th>
                                                                <th className="px-3 py-2 text-center font-medium">Horario</th>
                                                                <th className="px-3 py-2 text-right font-medium">Horas</th>
                                                                <th className="px-3 py-2 text-left font-medium">Notas</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800/50">
                                                            {fila.registros.map((r, idx) => (
                                                                <tr key={`${fila.rawName}-${idx}`} className="hover:bg-slate-800/30 transition-colors">
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-5 text-slate-500 font-mono text-center">{r.dia}</span>
                                                                            <p className="text-slate-300 font-medium">
                                                                                {isObservedRecord(r) && <Clock size={10} className="text-amber-400 inline mr-1" />}
                                                                                Día {r.dia}
                                                                            </p>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center text-slate-400">
                                                                        {r.entrada !== '00:00' ? r.entrada : '??:??'} – {r.salida !== '00:00' ? r.salida : '??:??'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-medium text-slate-300">
                                                                        {isObservedRecord(r) ? (
                                                                            <span className="text-amber-500/80">pendiente</span>
                                                                        ) : (
                                                                            <span className="text-teal-400">{r.horas.toFixed(1)}h</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-500 text-[10px] italic">
                                                                        {r.observaciones && (
                                                                            <div className="flex items-center gap-1">
                                                                                <Sparkles size={9} className="text-purple-500/50" />
                                                                                <span className="truncate max-w-[120px]">{r.observaciones}</span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Import button */}
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Se importarán los registros de <strong className="text-white">{matchedRows.length}</strong> prestadores para <strong className="text-white">{mesLabel(preview.mes)}</strong>
                        </p>
                        <button
                            onClick={handleImport}
                            disabled={importing || matchedRows.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                            {importing
                                ? <RefreshCw size={14} className="animate-spin" />
                                : <Upload size={14} />
                            }
                            Confirmar importación
                        </button>
                    </div>
                </div>
            )
            }

            {/* Result Dashboard */}
            {
                result && preview && (
                    <div className="space-y-4">
                        {/* Status bar */}
                        {(() => {
                            const totalIncomplete = matchedRows.reduce((s, f) => s + f.registros.filter(r => isObservedRecord(r)).length, 0);
                            return (
                                <div className={`flex items-center gap-3 p-4 rounded-xl border ${result.inserted > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800 border-slate-700'}`}>
                                    {result.inserted > 0
                                        ? <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
                                        : <XCircle size={18} className="text-slate-400 flex-shrink-0" />
                                    }
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-white">Importación completada — {mesLabel(preview.mes)}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            <span className="text-emerald-400 font-medium">{result.inserted} registros insertados</span>
                                            {result.skipped > 0 && <> · <span className="text-slate-300">{result.skipped} omitidos (ya existían)</span></>}
                                            {totalIncomplete > 0 && <> · <span className="text-amber-400">{totalIncomplete} fichajes observados (requieren resolución manual)</span></>}
                                            {result.errors.length > 0 && <> · <span className="text-red-400">{result.errors.length} errores</span></>}
                                        </p>
                                    </div>
                                    {totalIncomplete > 0 && (
                                        <button
                                            onClick={() => openObservedCorrections()}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
                                        >
                                            <AlertTriangle size={12} />
                                            Corregir observados
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {observedRows.length > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl overflow-hidden">
                                <div className="px-4 py-3 border-b border-amber-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-amber-100">Fichajes que necesitan corrección manual</p>
                                        <p className="text-xs text-amber-200/80 mt-0.5">
                                            Hacé clic en una persona para abrir Observados en el período importado y resolverla.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => openObservedCorrections()}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
                                    >
                                        <AlertTriangle size={12} />
                                        Abrir todos
                                    </button>
                                </div>
                                <div className="divide-y divide-amber-500/10 max-h-64 overflow-y-auto">
                                    {observedRows.map((row, index) => (
                                        <button
                                            key={`${row.personalId}-${row.fecha}-${index}`}
                                            onClick={() => openObservedCorrections(row.personalId)}
                                            className="w-full px-4 py-2.5 text-left hover:bg-amber-500/10 transition-colors grid grid-cols-1 md:grid-cols-[1.4fr_110px_130px_1fr] gap-2 items-center"
                                        >
                                            <div>
                                                <p className="text-sm text-white font-medium">{row.personalNombre}</p>
                                                <p className="text-[10px] text-amber-300/80">{row.rawName}</p>
                                            </div>
                                            <span className="text-xs text-slate-300">{row.fecha}</span>
                                            <span className="text-xs text-slate-300 font-mono">{row.entrada} - {row.salida}</span>
                                            <span className="text-xs text-amber-200 truncate">
                                                {row.motivo}{row.observaciones ? ` · ${row.observaciones}` : ''}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* KPIs */}
                        {(() => {
                            const filas = matchedRows;
                            const totalHoras = filas.reduce((s, f) => s + f.registros.reduce((a, r) => a + r.horas, 0), 0);
                            const totalDias = filas.reduce((s, f) => s + f.registros.length, 0);
                            const promPorPersona = filas.length > 0 ? totalHoras / filas.length : 0;
                            return (
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { label: 'Prestadores', value: filas.length, color: 'text-teal-400' },
                                        { label: 'Horas totales', value: `${Math.round(totalHoras * 10) / 10}h`, color: 'text-violet-400' },
                                        { label: 'Días-persona', value: totalDias, color: 'text-blue-400' },
                                        { label: 'Prom. por prestador', value: `${Math.round(promPorPersona * 10) / 10}h`, color: 'text-amber-400' },
                                    ].map(k => (
                                        <div key={k.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                                            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Detail table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden print:border-slate-300 print:text-black">
                            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between print:border-slate-300">
                                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide print:text-black">Detalle por prestador</p>
                                <div className="flex items-center gap-3 print:hidden">
                                    <button
                                        onClick={exportToCsv}
                                        className="flex items-center gap-1.5 text-[10px] text-teal-400 font-medium hover:text-teal-300 transition-colors px-2 py-1 bg-teal-500/10 border border-teal-500/20 rounded-lg"
                                    >
                                        <Download size={11} />
                                        Resumen
                                    </button>
                                    <button
                                        onClick={exportDetailedCsv}
                                        className="flex items-center gap-1.5 text-[10px] text-violet-400 font-medium hover:text-violet-300 transition-colors px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg"
                                    >
                                        <FileSpreadsheet size={11} />
                                        Detalle Diario
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium hover:text-white transition-colors px-2 py-1 border border-slate-700 rounded-lg"
                                    >
                                        Imprimir
                                    </button>
                                    <p className="text-xs text-slate-500">{mesLabel(preview.mes)}</p>
                                </div>
                                <p className="hidden print:block text-xs text-slate-600">{mesLabel(preview.mes)}</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-slate-400">
                                            <th className="px-4 py-2 text-left font-medium">Prestador</th>
                                            <th className="px-3 py-2 text-center font-medium">Días</th>
                                            <th className="px-3 py-2 text-right font-medium">Total horas</th>
                                            <th className="px-3 py-2 text-right font-medium">Prom/día</th>
                                            <th className="px-3 py-2 text-center font-medium">Horario típico</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {matchedRows
                                            .map(f => {
                                                const complete = f.registros.filter(r => !isObservedRecord(r));
                                                const incomplete = f.registros.filter(r => isObservedRecord(r));
                                                const totalH = complete.reduce((s, r) => s + r.horas, 0);
                                                const dias = f.registros.length;
                                                const ingresos = complete.filter(r => r.entrada !== '00:00').map(r => r.entrada).sort();
                                                const egresos = complete.filter(r => r.salida !== '00:00').map(r => r.salida).sort();
                                                const horaRango = ingresos.length > 0
                                                    ? `${ingresos[0]} – ${egresos.at(-1) ?? '?'}`
                                                    : '—';
                                                return { f, totalH, dias, horaRango, incompleteCount: incomplete.length };
                                            })
                                            .sort((a, b) => b.totalH - a.totalH)
                                            .map(({ f, totalH, dias, horaRango, incompleteCount }) => (
                                                <Fragment key={f.rawName}>
                                                    <tr
                                                        onClick={() => setExpandedRow(expandedRow === f.rawName ? null : f.rawName)}
                                                        className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                                                    >
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center gap-2">
                                                                    {expandedRow === f.rawName ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                                                                    <div className="flex items-center">
                                                                        {getBadges(f).map((b, i) => (
                                                                            <span key={i} title={b.label} className={`flex items-center p-0.5 -ml-1.5 first:ml-0 rounded-full border bg-slate-900 ${b.bg}`}>
                                                                                {b.icon}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <a
                                                                        href={f.personalId ? getProviderHoursUrl(f.personalId) : '#'}
                                                                        onClick={(event) => event.stopPropagation()}
                                                                        className="text-white font-medium hover:text-teal-300 underline-offset-2 hover:underline"
                                                                    >
                                                                        {f.personalNombre}
                                                                    </a>
                                                                    <p className="text-slate-500 text-[10px]">{f.rawName}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center text-slate-300">
                                                            {dias}
                                                            {incompleteCount > 0 && (
                                                                <span className="ml-1 text-amber-400" title={`${incompleteCount} fichajes observados`}>
                                                                    ({incompleteCount} pend.)
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-semibold text-teal-400">{Math.round(totalH * 10) / 10}h</td>
                                                        <td className="px-3 py-2.5 text-right text-slate-300">{dias > 0 ? `${Math.round(totalH / dias * 10) / 10}h` : '—'}</td>
                                                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{horaRango}</td>
                                                    </tr>
                                                    {expandedRow === f.rawName && (
                                                        <tr className="bg-slate-950/30">
                                                            <td colSpan={5} className="px-4 py-3">
                                                                <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 overflow-hidden shadow-inner">
                                                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Registros diarios importados</p>
                                                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                                                                        {f.registros.map((r: ProsoftRegistro, idx: number) => (
                                                                            <div key={idx} className={`p-1.5 rounded-md border text-[10px] ${isObservedRecord(r) ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/40 border-slate-800'}`}>
                                                                                <div className="flex justify-between items-center mb-1">
                                                                                    <span className="text-slate-500 font-bold">Día {r.dia}</span>
                                                                                    {isObservedRecord(r) ? <Clock size={8} className="text-amber-500" /> : <span className="text-teal-500 font-bold">{r.horas}h</span>}
                                                                                </div>
                                                                                <div className="text-slate-400 flex flex-col gap-0.5">
                                                                                    <span>E: {r.entrada}</span>
                                                                                    <span>S: {r.salida}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            ))
                                        }
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-700 bg-slate-800/40">
                                            <td className="px-4 py-2.5 text-white font-semibold">TOTAL</td>
                                            <td className="px-3 py-2.5 text-center text-slate-300">
                                                {matchedRows.reduce((s, f) => s + f.registros.length, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-bold text-teal-300">
                                                {Math.round(matchedRows.reduce((s, f) => s + f.registros.reduce((a, r) => a + r.horas, 0), 0) * 10) / 10}h
                                            </td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {result.errors.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 space-y-1">
                                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                            </div>
                        )}

                        <button
                            onClick={() => { setResult(null); setPreview(null); setFile(null); }}
                            className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            ← Nueva importación
                        </button>
                    </div>
                )
            }
        </div >
    );
}
