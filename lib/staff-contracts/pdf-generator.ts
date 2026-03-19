import jsPDF from 'jspdf';
import type { ContractPersonalData } from './types';
import { ANEXO_A_MAP } from './anexo-a';

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function generateStaffContractPDF(data: ContractPersonalData): Blob {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const PW = 210;
    const PH = 297;
    const M = 20;
    const CW = PW - M * 2;
    let y = M;

    function checkPage(needed = 8) {
        if (y + needed > PH - M) {
            doc.addPage();
            y = M;
        }
    }

    function addCenteredText(text: string, size = 12, bold = false) {
        checkPage(10);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, CW);
        lines.forEach((line: string) => {
            checkPage(6);
            doc.text(line, PW / 2, y, { align: 'center' });
            y += size * 0.4 + 1;
        });
        y += 3;
    }

    function addHeading(text: string, size = 11) {
        checkPage(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, CW);
        lines.forEach((line: string) => {
            checkPage(6);
            doc.text(line, M, y);
            y += size * 0.4 + 1.5;
        });
        y += 3;
    }

    function addBody(text: string, indent = 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(text, CW - indent);
        lines.forEach((line: string) => {
            checkPage(5);
            doc.text(line, M + indent, y);
            y += 5;
        });
        y += 2;
    }

    function addSpace(mm = 5) {
        y += mm;
    }

    function addHR() {
        checkPage(6);
        doc.setDrawColor(180, 180, 180);
        doc.line(M, y, PW - M, y);
        y += 6;
    }

    function addSignatureBlock(leftLabel: string, leftName: string, leftDni: string, rightLabel: string, rightName: string, rightDni: string) {
        checkPage(40);
        addSpace(8);
        const col1X = M;
        const col2X = PW / 2 + 5;
        const colW = CW / 2 - 10;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(leftLabel, col1X, y);
        doc.text(rightLabel, col2X, y);
        y += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Firma:', col1X, y);
        doc.text('Firma:', col2X, y);
        y += 5;
        doc.line(col1X, y, col1X + colW, y);
        doc.line(col2X, y, col2X + colW, y);
        y += 7;

        doc.text(`Aclaración: ${leftName}`, col1X, y);
        doc.text(`Aclaración: ${rightName}`, col2X, y);
        y += 5;
        doc.text(`DNI: ${leftDni}`, col1X, y);
        doc.text(`DNI: ${rightDni}`, col2X, y);
        y += 8;
    }

    const { nombre, apellido, dni, domicilio, fecha, anexoRol } = data;
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = MESES[fecha.getMonth()];
    const anio = String(fecha.getFullYear());
    const nombreCompleto = `${nombre} ${apellido}`.trim();

    // ────────────────────────────────────────────────────────────────
    // PAGE 1-2: MASTER CONTRACT
    // ────────────────────────────────────────────────────────────────

    addCenteredText('AM', 16, true);
    addCenteredText('CONTRATO DE LOCACIÓN DE SERVICIOS INDEPENDIENTES', 13, true);
    addSpace(4);
    addHR();

    addBody('ENTRE:');
    addSpace(2);
    addBody(
        'FULL ESTHETIC S.A., CUIT N° 30-71774841-2, con domicilio en Camila O\'Gorman 412, Piso 1, Oficina 101, Ciudad Autónoma de Buenos Aires, en adelante "LA CONTRATANTE", representada en este acto por su Director, Dr. Ariel Merino, DNI 33.447.153, por una parte;'
    );
    addSpace(2);
    addBody('Y');
    addSpace(2);
    addBody(
        `${nombreCompleto}, DNI N° ${dni}, con domicilio en ${domicilio}, en adelante "EL/LA LOCADOR/A", por la otra;`
    );
    addSpace(2);
    addBody(
        'se acuerda celebrar el presente CONTRATO DE LOCACIÓN DE SERVICIOS INDEPENDIENTES, sujeto a las siguientes cláusulas:'
    );
    addSpace(4);

    // PRIMERA
    addHeading('PRIMERA — OBJETO');
    addBody(
        'LA CONTRATANTE encomienda a EL/LA LOCADOR/A la prestación de servicios profesionales independientes, de acuerdo con la descripción de funciones detallada en el ANEXO A del presente contrato, que forma parte integrante del mismo.'
    );

    // SEGUNDA
    addHeading('SEGUNDA — MODALIDAD DE LA PRESTACIÓN');
    addBody(
        'Los servicios serán prestados de manera autónoma e independiente, sin sujeción a horario fijo ni jornada laboral, de conformidad con los términos pactados entre las partes. EL/LA LOCADOR/A no estará sujeto/a a dirección, supervisión directa ni relación de dependencia con LA CONTRATANTE. El/La LOCADOR/A organiza libremente su tiempo, métodos y herramientas de trabajo.'
    );

    // TERCERA
    addHeading('TERCERA — VIGENCIA');
    addBody(
        'El presente contrato tendrá una vigencia de doce (12) meses a partir de la fecha de su suscripción, pudiendo ser renovado por acuerdo expreso y escrito de ambas partes. Cualquiera de las partes podrá dar por terminado el contrato mediante notificación fehaciente con treinta (30) días corridos de anticipación.'
    );

    // CUARTA
    addHeading('CUARTA — HONORARIOS Y FORMA DE PAGO');
    addBody(
        'La remuneración por los servicios prestados será acordada entre las partes y detallada en instrumento separado (recibo, planilla de liquidación o cualquier otro medio válido que las partes adopten). Los honorarios se liquidarán mensualmente, entre el día 1 y el día 7 del mes siguiente al de la prestación, salvo acuerdo en contrario. EL/LA LOCADOR/A deberá emitir el comprobante fiscal correspondiente según su situación impositiva.'
    );

    // QUINTA
    addHeading('QUINTA — USO DE INSTALACIONES Y EQUIPAMIENTO');
    addBody(
        'LA CONTRATANTE podrá poner a disposición de EL/LA LOCADOR/A las instalaciones, equipos y materiales del consultorio necesarios para la prestación de los servicios acordados. Dicho uso quedará limitado al horario y las condiciones establecidas por LA CONTRATANTE, sin que ello implique cesión, arrendamiento ni modificación alguna del carácter independiente de la relación. Los gastos propios de EL/LA LOCADOR/A (movilidad, insumos personales, etc.) serán a su exclusivo cargo.'
    );

    // SEXTA
    addHeading('SEXTA — NATURALEZA DE LA RELACIÓN Y AUSENCIA DE VÍNCULO LABORAL');
    addBody(
        'Las partes declaran expresamente que la presente relación tiene carácter civil y comercial, de locación de servicios, en el marco del Código Civil y Comercial de la Nación. En ningún caso el presente contrato implica relación de empleo ni dependencia laboral. En consecuencia, no corresponde el reconocimiento de beneficios propios del derecho del trabajo, tales como vacaciones pagas, antigüedad, sueldo anual complementario (aguinaldo), indemnización por despido ni ningún otro instituto laboral. EL/LA LOCADOR/A declara conocer y aceptar esta condición, y asume la responsabilidad de cumplir con sus obligaciones impositivas y previsionales como trabajador/a independiente.'
    );

    // SÉPTIMA
    addHeading('SÉPTIMA — CONFIDENCIALIDAD');
    addBody(
        'EL/LA LOCADOR/A se compromete a mantener absoluta reserva y confidencialidad respecto de toda información que conozca en el ejercicio de sus funciones, incluyendo datos de pacientes, procesos internos, información financiera, estrategias comerciales y cualquier otro dato sensible de LA CONTRATANTE o de sus pacientes. Esta obligación se extiende durante la vigencia del contrato y con posterioridad a su finalización, sin límite temporal. El incumplimiento de este deber dará derecho a LA CONTRATANTE a reclamar los daños y perjuicios que pudieran corresponder.'
    );

    // OCTAVA
    addHeading('OCTAVA — PROPIEDAD INTELECTUAL Y DERECHOS DE IMAGEN');
    addBody(
        'Toda producción intelectual, contenido digital, material fotográfico, diseño, estrategia o desarrollo que EL/LA LOCADOR/A genere en el marco de los servicios aquí contratados será de propiedad exclusiva de LA CONTRATANTE, salvo acuerdo escrito en contrario. EL/LA LOCADOR/A autoriza a LA CONTRATANTE el uso de su imagen, nombre y voz en el contexto de las actividades propias del consultorio, con fines institucionales y de comunicación, sin que ello genere derecho a compensación adicional.'
    );

    // NOVENA
    addHeading('NOVENA — NO COMPETENCIA');
    addBody(
        'El presente contrato no implica exclusividad para EL/LA LOCADOR/A, quien podrá desarrollar actividades profesionales en otros ámbitos, siempre que ello no afecte el cumplimiento de los servicios aquí contratados. Sin perjuicio de lo anterior, EL/LA LOCADOR/A asume el compromiso de no incurrir en conductas de competencia desleal respecto de LA CONTRATANTE, durante la vigencia del contrato y por un período de seis (6) meses posteriores a su finalización. En ese marco, las partes entienden por competencia desleal: (a) la captación de pacientes de LA CONTRATANTE con el fin de derivarlos hacia la práctica propia o de terceros; (b) la recomendación o facilitación activa de la incorporación de colegas, proveedores o integrantes del equipo a otras instituciones o emprendimientos propios; (c) la inducción de otros integrantes del equipo a desvincularse con el propósito de incorporarlos a estructuras propias o ajenas.'
    );

    // DÉCIMA
    addHeading('DÉCIMA — RESPONSABILIDAD PROFESIONAL');
    addBody(
        'EL/LA LOCADOR/A es responsable de la calidad técnica de los servicios que presta, debiendo contar con la habilitación, matrícula o certificación que corresponda según su actividad profesional. Asimismo, deberá mantener vigente la cobertura de seguro de responsabilidad civil profesional que resulte aplicable. LA CONTRATANTE no será responsable por actos, omisiones o errores técnicos de EL/LA LOCADOR/A en el ejercicio de su actividad.'
    );

    // DÉCIMA PRIMERA
    addHeading('DÉCIMA PRIMERA — RESCISIÓN');
    addBody(
        'Cualquiera de las partes podrá resolver el presente contrato en forma anticipada mediante notificación fehaciente con treinta (30) días corridos de anticipación. LA CONTRATANTE podrá rescindir el contrato en forma inmediata y sin preaviso ante incumplimientos graves por parte de EL/LA LOCADOR/A, incluyendo pero no limitados a: violación del deber de confidencialidad, actos de competencia desleal, incumplimiento reiterado de las normas internas, o conductas que afecten la reputación o imagen institucional de LA CONTRATANTE.'
    );

    // DÉCIMA SEGUNDA
    addHeading('DÉCIMA SEGUNDA — JURISDICCIÓN Y LEY APLICABLE');
    addBody(
        'Para todos los efectos del presente contrato, las partes acuerdan someterse a la jurisdicción de los Tribunales Ordinarios de la Ciudad Autónoma de Buenos Aires. El presente contrato se rige por las leyes de la República Argentina.'
    );

    addSpace(6);
    addBody(
        `Firmado en la Ciudad Autónoma de Buenos Aires, a los ${dia} días del mes de ${mes} de ${anio}.`
    );

    addSignatureBlock(
        'POR FULL ESTHETIC S.A.',
        'Dr. Ariel Merino',
        '33.447.153',
        'POR EL/LA LOCADOR/A',
        nombreCompleto,
        dni
    );

    // ────────────────────────────────────────────────────────────────
    // ANEXO A
    // ────────────────────────────────────────────────────────────────
    doc.addPage();
    y = M;

    const anexo = ANEXO_A_MAP[anexoRol];

    addCenteredText('AM', 16, true);
    addCenteredText('ANEXO A — DESCRIPCIÓN DE FUNCIONES', 13, true);
    addCenteredText(`Rol: ${anexo.titulo}`, 11, false);
    addSpace(4);
    addHR();

    addHeading('Partes');
    addBody(
        `FULL ESTHETIC S.A. (LA CONTRATANTE) y ${nombreCompleto}, DNI N° ${dni} (EL/LA LOCADOR/A).`
    );
    addSpace(4);

    addHeading('Funciones y Tareas Encomendadas');

    // Split the funciones text by double newline paragraphs so numbered items render correctly
    const funcionesParagraphs = anexo.funciones.split('\n\n');
    for (const paragraph of funcionesParagraphs) {
        if (paragraph.trim()) {
            addBody(paragraph.trim());
        }
    }

    addSpace(8);
    addBody(
        `Firmado en la Ciudad Autónoma de Buenos Aires, a los ${dia} días del mes de ${mes} de ${anio}.`
    );

    addSignatureBlock(
        'POR FULL ESTHETIC S.A.',
        'Dr. Ariel Merino',
        '33.447.153',
        'POR EL/LA LOCADOR/A',
        nombreCompleto,
        dni
    );

    // ────────────────────────────────────────────────────────────────
    // ANEXO B — NORMAS DE CONVIVENCIA GENERAL
    // ────────────────────────────────────────────────────────────────
    doc.addPage();
    y = M;

    addCenteredText('AM', 16, true);
    addCenteredText('ANEXO B — NORMAS DE CONVIVENCIA GENERAL', 13, true);
    addCenteredText('AM Estética Dental — FULL ESTHETIC S.A.', 10, false);
    addSpace(4);
    addHR();

    addBody(
        'El presente Anexo establece las normas de conducta y convivencia aplicables a todas las personas que presten servicios en el ámbito de AM Estética Dental, con independencia de la naturaleza jurídica del vínculo que las una con LA CONTRATANTE. Estas normas forman parte integrante del contrato y su incumplimiento podrá dar lugar a las consecuencias previstas en el mismo.'
    );
    addSpace(4);

    const normas = [
        {
            num: '1.',
            titulo: 'PUNTUALIDAD Y RESPONSABILIDAD',
            texto: 'Toda persona que preste servicios en el consultorio debe respetar los horarios y compromisos acordados. Ante cualquier imposibilidad de concurrir o de cumplir con lo pactado, deberá comunicarlo con la mayor anticipación posible y de manera fehaciente, a fin de permitir la reorganización del trabajo y la atención de los pacientes.',
        },
        {
            num: '2.',
            titulo: 'TRATO CON PACIENTES Y EQUIPO',
            texto: 'Se requiere un trato respetuoso, amable y profesional con todos los pacientes y con el resto del equipo, en todo momento y en cualquier canal de comunicación (presencial, telefónico o digital). No se tolerarán conductas que puedan afectar la dignidad, la seguridad o el bienestar de ninguna persona en el ámbito del consultorio.',
        },
        {
            num: '3.',
            titulo: 'IMAGEN PERSONAL E INSTITUCIONAL',
            texto: 'Toda persona que preste servicios en AM Estética Dental deberá mantener una presentación personal adecuada, cuidando su higiene, vestimenta y comportamiento en consonancia con los estándares de una clínica odontológica de alto nivel. Se espera que la vestimenta, accesorios y elementos personales sean acordes al entorno clínico, salvo acuerdo expreso en contrario.',
        },
        {
            num: '4.',
            titulo: 'USO DE INSTALACIONES, EQUIPOS E INSUMOS',
            texto: 'Los equipos, instalaciones e insumos del consultorio están destinados exclusivamente a los fines propios de la actividad clínica y administrativa. Su uso para fines personales o ajenos al consultorio excede el alcance del presente acuerdo y no es parte de él. Cualquier daño o desperfecto deberá comunicarse de inmediato a quien corresponda.',
        },
        {
            num: '5.',
            titulo: 'ORDEN Y LIMPIEZA',
            texto: 'Cada integrante del equipo es responsable de mantener en orden y condiciones adecuadas el espacio de trabajo que utilice. Al finalizar cada jornada o turno, deberá dejarse el área en las mismas condiciones en que se encontró, colaborando activamente con los protocolos de limpieza y esterilización vigentes.',
        },
        {
            num: '6.',
            titulo: 'CONFIDENCIALIDAD DE INFORMACIÓN CLÍNICA Y COMERCIAL',
            texto: 'Toda información relativa a pacientes (datos personales, diagnósticos, tratamientos, presupuestos, historias clínicas) es estrictamente confidencial. Asimismo, la información interna del consultorio (precios, estrategias, proveedores, datos financieros) es reservada. Las partes acuerdan que dicha información se mantendrá dentro del ámbito estrictamente necesario para la prestación del servicio, tanto durante la vigencia del vínculo como con posterioridad a su finalización.',
        },
        {
            num: '7.',
            titulo: 'USO DE REDES SOCIALES Y COMUNICACIÓN DIGITAL',
            texto: 'No está permitido publicar en redes sociales personales u otros medios digitales fotografías, videos, comentarios ni información de ningún tipo relacionada con los pacientes, tratamientos, instalaciones o actividades del consultorio, sin autorización previa y expresa de la dirección. El uso de los canales institucionales del consultorio se regirá por los lineamientos y criterios de imagen que establezca LA CONTRATANTE.',
        },
        {
            num: '8.',
            titulo: 'COMUNICACIÓN INTERNA',
            texto: 'Se espera que toda comunicación interna sea clara, respetuosa y orientada a la resolución. Los conflictos o diferencias que puedan surgir entre integrantes del equipo deben ser abordados en forma directa y privada, o canalizados a través de la administración o dirección del consultorio, evitando comentarios o actitudes que generen tensión o malestar colectivo.',
        },
        {
            num: '9.',
            titulo: 'MANEJO DE EFECTIVO Y VALORES',
            texto: 'Las personas que en el ejercicio de sus funciones tengan acceso a fondos, pagos de pacientes u otros valores del consultorio, deberán actuar con la máxima transparencia y responsabilidad. Todo movimiento deberá ser registrado conforme a los procedimientos administrativos vigentes. Cualquier irregularidad detectada deberá comunicarse de inmediato a la dirección.',
        },
        {
            num: '10.',
            titulo: 'PROTOCOLO DE BIOSEGURIDAD',
            texto: 'Todas las personas que presten servicios en el consultorio deben cumplir en forma estricta con los protocolos de bioseguridad vigentes, incluyendo el uso de elementos de protección personal, procedimientos de esterilización y desinfección, manejo de residuos patogénicos y cualquier otra medida de higiene establecida por la dirección clínica o la normativa aplicable.',
        },
        {
            num: '11.',
            titulo: 'RELACIÓN CON PROVEEDORES Y TERCEROS',
            texto: 'EL/LA LOCADOR/A no podrá, en nombre propio ni en representación del consultorio, establecer acuerdos, compromisos o relaciones comerciales con proveedores, laboratorios u otros terceros vinculados al consultorio, sin autorización expresa de la dirección. Tampoco podrá recibir beneficios, comisiones o regalías de terceros en relación con su actividad en el consultorio, sin comunicarlo y obtener aprobación previa.',
        },
        {
            num: '12.',
            titulo: 'RESOLUCIÓN DE CONFLICTOS',
            texto: 'Ante cualquier situación de conflicto, desacuerdo o inconveniente que surja en el ámbito del consultorio, las partes se comprometen a intentar una resolución amigable y directa en primer término. Si ello no fuera posible, la cuestión será elevada a la dirección del consultorio para su mediación. Solo en caso de que estas instancias resulten infructuosas se recurrirá a las vías legales pertinentes.',
        },
        {
            num: '13.',
            titulo: 'RESPETO POR LOS TIEMPOS Y PROCESOS ADMINISTRATIVOS',
            texto: 'EL/LA LOCADOR/A deberá entregar en tiempo y forma toda documentación, comprobante fiscal o información que le sea requerida por el área administrativa del consultorio para la liquidación de honorarios, facturación o cualquier otro trámite interno. Los retrasos reiterados en esta materia podrán afectar los plazos de pago.',
        },
        {
            num: '14.',
            titulo: 'NO CAPTACIÓN DE PACIENTES',
            texto: 'Las partes acuerdan que la captación de pacientes del consultorio para derivarlos hacia la práctica profesional propia o de terceros no es compatible con el presente vínculo, durante su vigencia y hasta seis (6) meses después de su finalización. En el mismo sentido, el contacto con pacientes del consultorio con fines comerciales o profesionales ajenos al servicio contratado excede el marco de este acuerdo.',
        },
        {
            num: '15.',
            titulo: 'CUMPLIMIENTO GENERAL',
            texto: 'El incumplimiento de cualquiera de las normas establecidas en el presente Anexo será considerado falta grave y podrá dar lugar a la rescisión del contrato de locación de servicios en los términos previstos en el mismo, sin perjuicio de las acciones legales que pudieran corresponder.',
        },
    ];

    for (const norma of normas) {
        checkPage(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${norma.num} ${norma.titulo}`, M, y);
        y += 5.5;
        addBody(norma.texto);
        addSpace(2);
    }

    addSpace(6);
    addHR();
    addBody(
        'Habiendo tomado conocimiento y comprendido el alcance del presente Anexo B, EL/LA LOCADOR/A manifiesta su conformidad y compromiso de cumplimiento con la firma a continuación:'
    );
    addSpace(4);
    addBody(
        `Firmado en la Ciudad Autónoma de Buenos Aires, a los ${dia} días del mes de ${mes} de ${anio}.`
    );

    addSignatureBlock(
        'POR FULL ESTHETIC S.A.',
        'Dr. Ariel Merino',
        '33.447.153',
        'POR EL/LA LOCADOR/A',
        nombreCompleto,
        dni
    );

    return doc.output('blob');
}
