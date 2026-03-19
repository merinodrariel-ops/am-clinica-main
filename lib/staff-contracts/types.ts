export type AnexoRol =
    | 'odontologo'
    | 'asistente'
    | 'laboratorio'
    | 'admin'
    | 'fidelizacion'
    | 'marketing';

export interface ContractPersonalData {
    nombre: string;
    apellido: string;
    dni: string;
    domicilio: string;
    fecha: Date;
    anexoRol: AnexoRol;
}

export interface ContractRecord {
    id: string;
    personal_id: string;
    anexo_rol: AnexoRol;
    drive_url: string | null;
    estado: 'pendiente_firma' | 'firmado';
    generado_at: string;
    firmado_at: string | null;
    created_by: string | null;
    created_at: string;
}
