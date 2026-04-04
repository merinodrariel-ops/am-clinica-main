export interface ProsoftXmlRegistro {
    dia: number;
    fecha: string;
    entrada: string;
    salida: string;
    salidaDiaSiguiente?: boolean;
    horas: number;
    incompleto?: boolean;
    requiereRevision?: boolean;
    motivoObservado?: 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' | 'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
    observaciones?: string;
}

export interface ProsoftXmlFila {
    rawName: string;
    personalId: string | null;
    personalNombre: string;
    registros: ProsoftXmlRegistro[];
}

export interface ProsoftXmlPreview {
    mes: string;
    periodoDesde: string;
    periodoHasta: string;
    periodoDetectado: boolean;
    filas: ProsoftXmlFila[];
    sinMatch: string[];
    totalRegistros: number;
}

type XmlNode = {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    textParts: string[];
};

type LeafEntry = {
    path: string;
    key: string;
    value: string;
};

type CandidateRecord = {
    rawName: string;
    fecha: string;
    entrada: string;
    salida: string;
    salidaDiaSiguiente?: boolean;
    horas: number;
    incompleto?: boolean;
    requiereRevision?: boolean;
    motivoObservado?: ProsoftXmlRegistro['motivoObservado'];
    observaciones?: string;
};

const NAME_KEYWORDS = /(prestador|emplead|personal|persona|worker|staff|agent|name|nombre|apellido)/i;
const DATE_KEYWORDS = /(fecha|date|dia|day)/i;
const ENTRY_KEYWORDS = /(entrada|ingreso|inicio|start|checkin|desde)/i;
const EXIT_KEYWORDS = /(salida|egreso|fin|end|checkout|hasta)/i;
const HOURS_KEYWORDS = /(horas|hours|worked|netas|cantidad|total)/i;
const XML_DECLARATION = /^\s*<\?xml/i;

export function parseProsoftXml(xml: string): ProsoftXmlPreview {
    if (!xml.trim()) {
        throw new Error('El archivo XML está vacío.');
    }

    if (!XML_DECLARATION.test(xml) && !xml.includes('<')) {
        throw new Error('El archivo no tiene formato XML válido.');
    }

    const root = parseXmlTree(xml);
    const candidates = collectCandidateRecords(root);

    if (candidates.length === 0) {
        throw new Error('No pude interpretar nombre, fecha y horas dentro del XML.');
    }

    const deduped = dedupeRecords(candidates);
    const byName = new Map<string, ProsoftXmlRegistro[]>();
    let minDate = deduped[0].fecha;
    let maxDate = deduped[0].fecha;

    for (const record of deduped) {
        if (record.fecha < minDate) minDate = record.fecha;
        if (record.fecha > maxDate) maxDate = record.fecha;
        const current = byName.get(record.rawName) ?? [];
        current.push({
            dia: Number(record.fecha.slice(-2)),
            fecha: record.fecha,
            entrada: record.entrada,
            salida: record.salida,
            salidaDiaSiguiente: record.salidaDiaSiguiente,
            horas: record.horas,
            incompleto: record.incompleto,
            requiereRevision: record.requiereRevision,
            motivoObservado: record.motivoObservado,
            observaciones: record.observaciones,
        });
        byName.set(record.rawName, current);
    }

    const filas = Array.from(byName.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'es'))
        .map(([rawName, registros]) => ({
            rawName,
            personalId: null,
            personalNombre: '',
            registros: registros.sort((a, b) => a.fecha.localeCompare(b.fecha)),
        }));

    return {
        mes: minDate.slice(0, 7),
        periodoDesde: minDate,
        periodoHasta: maxDate,
        periodoDetectado: true,
        filas,
        sinMatch: filas.map((fila) => fila.rawName),
        totalRegistros: deduped.length,
    };
}

function collectCandidateRecords(node: XmlNode, inheritedName?: string): CandidateRecord[] {
    const entries = collectLeafEntries(node);
    const resolvedName = pickName(entries) ?? inheritedName;
    const currentRecord = resolvedName ? extractCandidateRecord(node, resolvedName) : null;
    const childRecords = node.children.flatMap((child) => collectCandidateRecords(child, resolvedName));
    return currentRecord ? [currentRecord, ...childRecords] : childRecords;
}

function parseXmlTree(xml: string): XmlNode {
    const root: XmlNode = { name: '__root__', attrs: {}, children: [], textParts: [] };
    const stack: XmlNode[] = [root];
    const tokens = xml.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g) ?? [];

    for (const token of tokens) {
        if (!token.trim()) continue;
        if (token.startsWith('<?') || token.startsWith('<!--')) continue;

        if (token.startsWith('<![CDATA[')) {
            const text = token.slice(9, -3).trim();
            if (text) stack[stack.length - 1].textParts.push(text);
            continue;
        }

        if (token.startsWith('</')) {
            stack.pop();
            continue;
        }

        if (token.startsWith('<')) {
            const selfClosing = token.endsWith('/>');
            const inner = token.slice(1, selfClosing ? -2 : -1).trim();
            if (!inner) continue;
            const spaceIdx = inner.search(/\s/);
            const name = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).trim();
            if (!name) continue;
            const attrsSource = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);
            const node: XmlNode = {
                name,
                attrs: parseAttributes(attrsSource),
                children: [],
                textParts: [],
            };
            stack[stack.length - 1].children.push(node);
            if (!selfClosing) stack.push(node);
            continue;
        }

        const text = token.replace(/\s+/g, ' ').trim();
        if (text) stack[stack.length - 1].textParts.push(text);
    }

    return root;
}

function parseAttributes(source: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const match of source.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
        attrs[match[1]] = match[3].trim();
    }
    return attrs;
}

function extractCandidateRecord(node: XmlNode, inheritedName?: string): CandidateRecord | null {
    const entries = collectLeafEntries(node);
    const rawName = pickName(entries) ?? inheritedName ?? null;
    const fecha = pickDate(entries);
    const times = pickTimes(entries);
    const explicitHours = pickHours(entries);

    if (!rawName || !fecha) return null;

    const parsed = resolveTimeRecord(times.entry, times.exit, explicitHours);
    if (!parsed) return null;

    return {
        rawName,
        fecha,
        entrada: parsed.entrada,
        salida: parsed.salida,
        salidaDiaSiguiente: parsed.salidaDiaSiguiente,
        horas: parsed.horas,
        incompleto: parsed.incompleto,
        requiereRevision: parsed.requiereRevision,
        motivoObservado: parsed.motivoObservado,
        observaciones: parsed.observaciones,
    };
}

function collectLeafEntries(node: XmlNode, path = node.name): LeafEntry[] {
    const entries: LeafEntry[] = [];
    const text = node.textParts.join(' ').replace(/\s+/g, ' ').trim();

    if (text && node.children.length === 0) {
        entries.push({ path, key: lastSegment(path), value: text });
    }

    for (const [attr, value] of Object.entries(node.attrs)) {
        if (!value) continue;
        entries.push({ path: `${path}.@${attr}`, key: attr, value });
    }

    for (const child of node.children) {
        entries.push(...collectLeafEntries(child, `${path}.${child.name}`));
    }

    return entries;
}

function pickName(entries: LeafEntry[]): string | null {
    const preferred = entries.find((entry) => NAME_KEYWORDS.test(entry.key) && looksLikePersonName(entry.value));
    if (preferred) return cleanName(preferred.value);

    const fallback = entries.find((entry) => looksLikePersonName(entry.value));
    return fallback ? cleanName(fallback.value) : null;
}

function pickDate(entries: LeafEntry[]): string | null {
    const preferred = entries.find((entry) => DATE_KEYWORDS.test(entry.key) && parseDateValue(entry.value));
    if (preferred) return parseDateValue(preferred.value);

    const fallback = entries.find((entry) => parseDateValue(entry.value));
    return fallback ? parseDateValue(fallback.value) : null;
}

function pickTimes(entries: LeafEntry[]): { entry: string | null; exit: string | null } {
    const timeEntries = entries
        .map((entry) => ({ entry, time: normalizeTime(entry.value) }))
        .filter((item): item is { entry: LeafEntry; time: string } => Boolean(item.time));

    const entryField = timeEntries.find((item) => ENTRY_KEYWORDS.test(item.entry.key));
    const exitField = timeEntries.find((item) => EXIT_KEYWORDS.test(item.entry.key));

    if (entryField || exitField) {
        return {
            entry: entryField?.time ?? null,
            exit: exitField?.time ?? null,
        };
    }

    const unique = Array.from(new Set(timeEntries.map((item) => item.time)));
    return {
        entry: unique[0] ?? null,
        exit: unique[1] ?? null,
    };
}

function pickHours(entries: LeafEntry[]): number | null {
    const preferred = entries.find((entry) => HOURS_KEYWORDS.test(entry.key) && parseHours(entry.value) !== null);
    if (preferred) return parseHours(preferred.value);

    return null;
}

function resolveTimeRecord(entry: string | null, exit: string | null, explicitHours: number | null) {
    if (entry && exit) {
        const computed = computeHours(entry, exit);
        if (computed.horas <= 0 || computed.horas > 24) {
            return {
                entrada: entry,
                salida: exit,
                horas: explicitHours ?? 0,
                requiereRevision: true,
                motivoObservado: 'Otro' as const,
                observaciones: 'Horario inválido, revisar manualmente',
            };
        }
        return {
            entrada: entry,
            salida: exit,
            salidaDiaSiguiente: computed.overnight,
            horas: explicitHours ?? computed.horas,
            requiereRevision: computed.horas > 14,
            motivoObservado: computed.horas > 14 ? 'HorasExcesivas' as const : undefined,
            observaciones: computed.horas > 14 ? `Jornada inusualmente larga (${computed.horas}h)` : undefined,
        };
    }

    if (entry || exit) {
        return {
            entrada: entry ?? '00:00',
            salida: exit ?? '00:00',
            horas: explicitHours ?? 0,
            incompleto: true,
            requiereRevision: true,
            motivoObservado: entry ? 'FaltaEgreso' as const : 'FaltaIngreso' as const,
            observaciones: 'Solo se detectó una marcación en el XML',
        };
    }

    if (explicitHours !== null) {
        return {
            entrada: '00:00',
            salida: '00:00',
            horas: explicitHours,
        };
    }

    return null;
}

function dedupeRecords(records: CandidateRecord[]): CandidateRecord[] {
    const map = new Map<string, CandidateRecord>();
    for (const record of records) {
        const key = `${record.rawName}::${record.fecha}`;
        const existing = map.get(key);
        if (!existing || existing.horas < record.horas) {
            map.set(key, record);
        }
    }
    return Array.from(map.values()).sort((a, b) => `${a.rawName}-${a.fecha}`.localeCompare(`${b.rawName}-${b.fecha}`));
}

function lastSegment(path: string) {
    return path.split('.').at(-1) ?? path;
}

function cleanName(value: string) {
    return value.replace(/\s+/g, ' ').trim();
}

function looksLikePersonName(value: string) {
    const cleaned = cleanName(value);
    if (cleaned.length < 3 || cleaned.length > 120) return false;
    if (parseDateValue(cleaned) || normalizeTime(cleaned) || parseHours(cleaned) !== null) return false;
    return /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(cleaned);
}

function parseDateValue(value: string): string | null {
    const cleaned = value.trim();
    let match = cleaned.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    match = cleaned.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;

    return null;
}

function normalizeTime(value: string): string | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseHours(value: string): number | null {
    const cleaned = value.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    if (parsed <= 0 || parsed > 24) return null;
    return Math.round(parsed * 100) / 100;
}

function computeHours(entry: string, exit: string) {
    const [entryHours, entryMinutes] = entry.split(':').map(Number);
    const [exitHours, exitMinutes] = exit.split(':').map(Number);
    const start = entryHours * 60 + entryMinutes;
    let end = exitHours * 60 + exitMinutes;
    let overnight = false;
    if (end < start) {
        end += 24 * 60;
        overnight = true;
    }
    const hours = Math.round(((end - start) / 60) * 100) / 100;
    return { horas: hours, overnight };
}
