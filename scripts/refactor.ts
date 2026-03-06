import * as fs from 'fs';

const filePath = 'app/actions/prosoft-import.ts';
let code = fs.readFileSync(filePath, 'utf8');

const toAdd = `import * as xlsx from 'xlsx';

export async function processProsoftRows(
    csvRows: string[][],
    mesOverride?: string
): Promise<ProsoftPreview> {
    const detectedPeriod = extractPeriodFromCsv(csvRows);
    const mes = mesOverride || detectedPeriod?.mes;

    if (!mes) {
        throw new Error(
            'No se pudo detectar el período automáticamente desde la planilla. Verificá que Prosoft incluya "Periodo: dd/mm/aaaa ~ dd/mm/aaaa".'
        );
    }

    const { employeeRows } = parseProsoftMatrix(csvRows);

    const [year, month] = mes.split('-').map(Number);
    const dayToDateMap = buildDayToDateMap(detectedPeriod);

    const rawNames = employeeRows.map(r => r.rawName);
    const matchMap = await matchEmployees(rawNames);

    const sinMatch: string[] = [];
    let totalRegistros = 0;

    const filas: ProsoftRow[] = await Promise.all(employeeRows.map(async (emp) => {
        const match = matchMap.get(emp.rawName);
        if (!match) sinMatch.push(emp.rawName);

        const registrosPromises = Object.entries(emp.timeCells)
            .map(async ([dayStr, cell]) => {
                const dia = parseInt(dayStr);
                const parsed = await parseTimeCell(cell);
                if (!parsed) return null;
                const fecha = dayToDateMap.get(dia) || \`\${year}-\${String(month).padStart(2, '0')}-\${String(dia).padStart(2, '0')}\`;
                return { dia, fecha, ...parsed };
            });

        const registros = (await Promise.all(registrosPromises)).filter(Boolean) as ProsoftRow['registros'];

        totalRegistros += registros.length;

        return {
            rawName: emp.rawName,
            personalId: match?.id ?? null,
            personalNombre: match ? \`\${match.nombre} \${match.apellido || ''}\`.trim() : '',
            registros,
        };
    }));

    const [retYear, retMonth] = mes.split('-').map(Number);
    const lastDay = new Date(retYear, retMonth, 0).getDate();

    return {
        mes,
        periodoDesde: detectedPeriod?.desde || \`\${mes}-01\`,
        periodoHasta: detectedPeriod?.hasta || \`\${mes}-\${String(lastDay).padStart(2, '0')}\`,
        periodoDetectado: Boolean(detectedPeriod),
        filas,
        sinMatch,
        totalRegistros,
    };
}

export async function previewProsoftFileSafe(
    formData: FormData,
    mesOverride?: string
): Promise<ActionResult<ProsoftPreview>> {
    try {
        const file = formData.get('file') as File;
        if (!file) throw new Error('No se envió ningún archivo');
        
        const buffer = Buffer.from(await file.arrayBuffer());
        const isCsv = file.name.endsWith('.csv');
        let csvText = '';
        
        if (isCsv) {
            csvText = buffer.toString('utf8');
        } else {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const firstSheetName = workbook.SheetNames[0];
            csvText = xlsx.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
        }
        
        const csvRows = parseCsvText(csvText);
        const preview = await processProsoftRows(csvRows, mesOverride);
        return { success: true, data: preview };
    } catch (e: unknown) {
        return { success: false, error: toActionErrorMessage(e, 'Error al procesar el archivo') };
    }
}

export async function importProsoftPreviewSafe(
    preview: ProsoftPreview,
    onlyMatched = true
): Promise<ActionResult<ImportResult>> {
    try {
        const admin = getAdminClient();
        let inserted = 0;
        let skipped = 0;
        const errors: string[] = [];

        const filasToImport = onlyMatched
            ? preview.filas.filter(f => f.personalId)
            : preview.filas;

        for (const fila of filasToImport) {
            if (!fila.personalId) {
                skipped += fila.registros.length;
                continue;
            }

            for (const reg of fila.registros) {
                const requiereRevision = Boolean(reg.incompleto || reg.requiereRevision);
                const estado = requiereRevision ? 'observado' : 'pending';
                const motivoObservado = requiereRevision ? (reg.motivoObservado || 'Otro') : null;

                let observaciones = requiereRevision
                    ? \`Registro observado por control automático (\${motivoObservado}) — Local \${preview.mes}\`
                    : \`Importado desde archivo local (\${preview.mes})\`;

                if (reg.observaciones) {
                    observaciones += \` | \${reg.observaciones}\`;
                }

                const { data: existing } = await admin
                    .from('registro_horas')
                    .select('id, horas')
                    .eq('personal_id', fila.personalId)
                    .eq('fecha', reg.fecha)
                    .maybeSingle();

                if (existing) {
                    if (Number(existing.horas) > 0 && !requiereRevision) {
                        skipped++;
                        continue;
                    }
                    const { error } = await admin
                        .from('registro_horas')
                        .update({
                            horas: reg.horas,
                            hora_ingreso: reg.entrada,
                            hora_egreso: reg.salida,
                            estado,
                            motivo_observado: motivoObservado,
                            original_hora_ingreso: reg.entrada,
                            original_hora_egreso: reg.salida,
                            observaciones,
                        })
                        .eq('id', existing.id);
                    if (error) errors.push(\`\${fila.rawName} \${reg.fecha}: \${error.message}\`);
                    else inserted++;
                    continue;
                }

                const { error } = await admin.from('registro_horas').insert({
                    personal_id: fila.personalId,
                    fecha: reg.fecha,
                    horas: reg.horas,
                    hora_ingreso: reg.entrada,
                    hora_egreso: reg.salida,
                    estado,
                    motivo_observado: motivoObservado,
                    original_hora_ingreso: reg.entrada,
                    original_hora_egreso: reg.salida,
                    observaciones,
                });

                if (error) {
                    errors.push(\`\${fila.rawName} \${reg.fecha}: \${error.message}\`);
                } else {
                    inserted++;
                }
            }
        }

        return { success: true, data: { inserted, skipped, errors } };
    } catch (e: unknown) {
        return { success: false, error: toActionErrorMessage(e, 'Error al importar') };
    }
}
`;

// Insert the new methods at the bottom of the file
code = code + '\n' + toAdd;

// Replace the duplicate logic in previewProsoftImport
const replaceSearch = /const detectedPeriod = extractPeriodFromCsv\(csvRows\);[\s\S]*?totalRegistros,\n    \};\n\}/m;
const replaceWith = `const preview = await processProsoftRows(csvRows, mesOverride);
    return preview;
}`;
code = code.replace(replaceSearch, replaceWith);

// Update 'Registrado' and 'Observado' to 'pending' and 'observado' in importProsoftData
code = code.replace(/const estado = requiereRevision \? 'Observado' : 'Registrado';/g, "const estado = requiereRevision ? 'observado' : 'pending';");

fs.writeFileSync(filePath, code);
console.log('Done!');
