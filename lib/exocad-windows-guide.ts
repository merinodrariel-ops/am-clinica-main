export interface ExocadWindowsGuide {
    title: string;
    summary: string;
    windowsOnly: boolean;
    humanSteps: string[];
    agentPrompt: string[];
    technicalNotes: string[];
}

export const EXOCAD_WINDOWS_GUIDE: ExocadWindowsGuide = {
    title: 'ExoCAD en Windows',
    summary:
        'Esta integracion aplica solo a PCs Windows con ExoCAD instalado. La meta es que desde AM Clinica se pueda abrir un caso en ExoCAD con un clic, usando un helper local en la PC.',
    windowsOnly: true,
    humanSteps: [
        'Confirmar que la PC corre Windows y que ExoCAD esta instalado localmente.',
        'Verificar la presencia de DentalDB y DentalCADApp en la instalacion de ExoCAD.',
        'Identificar si la PC tiene disponible el helper local observado en esta instalacion: DentalDB/bin/CopyAndOpen.exe.',
        'Definir la ruta local desde la cual AM Clinica va a entregar o copiar el archivo del caso .dentalProject.',
        'Crear o ajustar un script de PowerShell local para esa PC que reciba el archivo origen, resuelva el destino local y lance el helper.',
        'Probar el flujo con un caso real desde Windows: copiar el proyecto, abrir ExoCAD y confirmar que el caso correcto queda abierto.',
        'Guardar en esta seccion la version final del script o del comando estable cuando aparezca el MD especifico de la tarea.',
    ],
    agentPrompt: [
        'Objetivo: dejar una PC Windows con ExoCAD lista para abrir casos directo desde AM Clinica.',
        'Restricciones: esto es solo para Windows; no tocar Mac; no usar hacks de hosts, injektor o bloqueos de dominios como camino recomendado.',
        'Que tenes que hacer:',
        '1. Detectar las rutas instaladas de DentalDB y DentalCADApp.',
        '2. Verificar si existe el helper DentalDB/bin/CopyAndOpen.exe.',
        '3. Proponer o crear un script de PowerShell que reciba un archivo .dentalProject de origen y una ruta destino local.',
        '4. El script debe copiar el archivo al destino y abrirlo usando el helper legitimo disponible en la instalacion.',
        '5. Dejar el comando final listo para que luego la app pueda invocarlo con un clic.',
        '6. Documentar prerequisitos, rutas detectadas y ejemplo real de uso.',
        'Resultado esperado: la PC queda preparada para que AM Clinica pueda disparar la apertura directa de un caso ExoCAD desde Windows.',
    ],
    technicalNotes: [
        'En la copia revisada de una PC Windows con ExoCAD aparecieron DentalDB/bin/DentalDB.exe y DentalCADApp/bin/DentalCADApp.exe.',
        'Tambien aparecio DentalDB/bin/CopyAndOpen.exe, que por sus textos internos parece pedir archivo origen y archivo destino, copiar y luego abrir.',
        'Ese helper es hoy la pista mas limpia para la integracion app -> ExoCAD.',
        'No se deja como camino recomendado ningun script tipo Host lock.bat, INSTALL service injektor.cmd o injektor.exe, porque no describen una integracion legitima de apertura de casos.',
        'Falta todavia el MD especifico de la tarea; cuando aparezca, esta guia se corrige sobre esa fuente.',
    ],
};
