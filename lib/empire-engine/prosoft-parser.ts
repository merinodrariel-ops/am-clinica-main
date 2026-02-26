import * as XLSX from 'xlsx';

export interface ProsoftRecord {
    dni: string;
    nombre: string;
    fecha: string;
    entrada: string;
    salida: string;
    horasNetas: number;
}

export function parseProsoftExcel(buffer: Buffer): ProsoftRecord[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // We assume the first sheet contains the data.
    // The exact column mapping will depend on a sample file,
    // but we'll implement a robust mapping logic here.
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    return data.map(row => {
        // Logic to calculate hours based on 'entrada' and 'salida'
        const entrada = row['Entrada'] || row['ENTRADA'] || '';
        const salida = row['Salida'] || row['SALIDA'] || '';

        let horasNetas = 0;
        if (entrada && salida) {
            const [hE, mE] = entrada.split(':').map(Number);
            const [hS, mS] = salida.split(':').map(Number);

            if (!isNaN(hE) && !isNaN(hS)) {
                const totalMinutes = (hS * 60 + mS) - (hE * 60 + mE);
                horasNetas = Math.max(0, totalMinutes / 60);
            }
        }

        return {
            dni: String(row['DNI'] || row['Documento'] || ''),
            nombre: String(row['Nombre'] || row['Empleado'] || ''),
            fecha: String(row['Fecha'] || ''),
            entrada,
            salida,
            horasNetas: Number(horasNetas.toFixed(2))
        };
    });
}
