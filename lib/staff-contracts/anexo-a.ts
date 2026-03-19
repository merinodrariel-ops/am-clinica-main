import type { AnexoRol } from './types';

export interface AnexoADefinition {
    titulo: string;
    funciones: string;
}

export const ANEXO_A_MAP: Record<AnexoRol, AnexoADefinition> = {
    odontologo: {
        titulo: 'Odontólogo/a',
        funciones: `EL/LA LOCADOR/A prestará servicios profesionales odontológicos independientes, pudiendo incluir, entre otras, las siguientes actividades:\n\n1. Atención clínica de pacientes en las áreas que correspondan a su formación, incumbencia y especialidad.\n\n2. Realización de diagnóstico, planificación de tratamientos, ejecución de procedimientos y controles posteriores.\n\n3. Seguimiento de casos clínicos y evaluación de evolución de tratamientos.\n\n4. Participación en planificación interdisciplinaria cuando el caso lo requiera.\n\n5. Colaboración en registros clínicos, fotografía clínica, escaneos, documentación de casos y planificación digital, cuando corresponda al tratamiento.\n\n6. Coordinación general con asistentes, recepción, administración, laboratorio o demás áreas involucradas en la atención integral del paciente.\n\n7. Cumplimiento de protocolos de atención, bioseguridad, calidad de servicio e imagen institucional de LA CONTRATANTE.\n\nLas tareas antes mencionadas se describen de manera enunciativa y no taxativa, pudiendo comprender otras prestaciones razonablemente vinculadas a la actividad profesional comprometida.`,
    },
    asistente: {
        titulo: 'Asistente Dental',
        funciones: `EL/LA LOCADOR/A tendrá a su cargo tareas de asistencia clínica y apoyo operativo, incluyendo preparación de gabinetes, acondicionamiento de instrumental, acompañamiento al profesional durante procedimientos, recepción y acompañamiento de pacientes, organización operativa, apoyo administrativo y eventual colaboración en procesos digitales o de laboratorio simples, cuando ello resulte necesario para el correcto funcionamiento del consultorio.\n\nLas tareas antes mencionadas se describen de manera enunciativa y no taxativa, pudiendo comprender otras actividades razonablemente vinculadas al área comprometida.`,
    },
    laboratorio: {
        titulo: 'Laboratorista Digital',
        funciones: `EL/LA LOCADOR/A prestará servicios técnicos independientes vinculados al área de laboratorio dental y digital, pudiendo incluir, entre otras, las siguientes actividades:\n\n1. Diseño digital de trabajos odontológicos.\n\n2. Preparación, revisión y gestión de archivos digitales vinculados a escaneos, diseños, impresiones y planificación técnica.\n\n3. Impresión 3D de modelos, guías, férulas, alineadores u otros elementos relacionados con la operatoria del área.\n\n4. Colaboración técnica en flujos de alineadores invisibles, cerámicas, mockups, provisionales y otros procesos de laboratorio.\n\n5. Control y seguimiento técnico de trabajos vinculados a laboratorio y diseño digital.\n\n6. Colaboración con odontólogos, asistentes y administración para garantizar continuidad operativa en casos que requieran intervención del área.\n\n7. Cumplimiento de protocolos de orden, calidad, confidencialidad, bioseguridad e imagen institucional de LA CONTRATANTE.\n\nLas tareas antes mencionadas se describen de manera enunciativa y no taxativa.`,
    },
    admin: {
        titulo: 'Administrativo/a y Gestión',
        funciones: `EL/LA LOCADOR/A tendrá a su cargo tareas de organización administrativa, seguimiento operativo, soporte de gestión, coordinación interna, control documental, acompañamiento de procesos de atención, asistencia en recepción y apoyo general a distintas áreas del consultorio, según necesidades operativas.\n\nLas tareas antes mencionadas se describen de manera enunciativa y no taxativa, pudiendo comprender otras actividades razonablemente vinculadas al área de administración y gestión.`,
    },
    fidelizacion: {
        titulo: 'Fidelización de Pacientes y Ventas',
        funciones: `EL/LA LOCADOR/A tendrá a su cargo tareas vinculadas al seguimiento, fidelización y retención de pacientes, incluyendo contacto telefónico y digital con pacientes activos e inactivos, gestión de recordatorios de turnos y tratamientos pendientes, coordinación de propuestas de continuidad de tratamiento, apoyo en procesos de presentación de planes y presupuestos, y colaboración general con el equipo de recepción y administración para mejorar la experiencia del paciente.\n\nLas tareas antes mencionadas se describen de manera enunciativa y no taxativa.`,
    },
    marketing: {
        titulo: 'Marketing y Comunicación',
        funciones: `EL/LA LOCADOR/A tendrá a su cargo tareas vinculadas a la comunicación institucional y digital de la marca, incluyendo producción de contenido para redes sociales, diseño de piezas gráficas institucionales, gestión de canales digitales, coordinación de campañas de comunicación, fotografía y producción audiovisual en el consultorio, y apoyo general en la estrategia de imagen y presencia digital de AM Estética Dental.\n\nLas tareas antes mencionadas se describen de manera enunciativa y no taxativa.`,
    },
};
