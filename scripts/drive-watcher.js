/**
 * AM Drive Watcher & Intelligent Auto-Classifier
 * 
 * Este script se conecta de manera segura a la base de datos Supabase de la clínica
 * para listar los pacientes reales y organiza automáticamente los archivos de Google Drive 
 * local de drarielmerino@gmail.com.
 * 
 * Funciones clave:
 * 1. Conexión segura a base de datos para emparejar pacientes sin fallas.
 * 2. Clasificación automática inteligente por tipo de archivo y contenido.
 * 3. Enlaces simbólicos (symlinks) híbridos para proyectos de Exocad (Exocad funciona al 100%).
 * 4. Modo Watcher continuo que auto-ordena todo al arrastrar y soltar.
 */

const fs = require('fs');
const path = require('path');

// Cargar variables de entorno desde .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
} else {
    console.error('⚠️ No se encontró el archivo .env.local con las credenciales de Supabase.');
}

const { createClient } = require('@supabase/supabase-js');

// Configuración de rutas principales de Google Drive en macOS
const DRIVE_ROOT = '/Users/arimacm5/Library/CloudStorage/GoogleDrive-drarielmerino@gmail.com/Mi unidad';
const PACIENTES_DIR = path.join(DRIVE_ROOT, 'PACIENTES');
const PROYECTOS_EXOCAD_DIR = path.join(DRIVE_ROOT, 'PROYECTOS_EXOCAD');
const POR_CLASIFICAR_DIR = path.join(DRIVE_ROOT, 'POR_CLASIFICAR');

// Inicializar cliente Supabase si las credenciales están disponibles
let supabase = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('⚠️ Credenciales de Supabase incompletas. Se usará coincidencia heurística basada únicamente en nombres.');
}

// Estructura de carpetas para cada paciente
const SUBFOLDERS = {
    FOTOS: '1. Fotos',
    VIDEOS: '2. Videos',
    ESCANEOS: '3. Escaneos 3D',
    EXOCAD: '4. Proyectos CAD (Exocad)',
    DOCUMENTOS: '5. Documentos y Presupuestos',
    ESTUDIOS: '6. Estudios e Imagenes (Tomografías - RX)'
};

// Expresiones regulares y mapeo para clasificar archivos por extensión
const CLASSIFICATION_RULES = {
    FOTOS: /\.(heic|heif|jpg|jpeg|png|gif|bmp|tiff)$/i,
    VIDEOS: /\.(mov|mp4|avi|mkv|3gp|mpeg|mpg|wmv)$/i,
    ESCANEOS: /\.(stl|ply|obj|off|dxf)$/i,
    EXOCAD: /\.(dentalCAD|dentalProject|constructionInfo|modelInfo|constructionInfo\.bak|dentalProject\.bak)$/i,
    DOCUMENTOS: /\.(pdf|docx|xlsx|gdoc|gsheet|gslides|gform|pptx|txt|rtf|csv|odt|ods)$/i,
    ESTUDIOS: /\.(dcm|dicom)$/i
};

// Diccionario para caché de pacientes de la base de datos
let patientsCache = [];

/**
 * Normaliza textos quitando acentos, puntuación y convirtiendo a minúsculas
 */
function cleanText(text) {
    if (!text) return '';
    return text.toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s]/g, '') // Quitar puntuación
        .replace(/\s+/g, ' ') // Espacios simples
        .trim();
}

/**
 * Carga los pacientes desde la base de datos Supabase
 */
async function loadPatients() {
    if (!supabase) return [];
    console.log('🔄 Conectando a Supabase para cargar lista de pacientes...');
    try {
        const { data, error } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento')
            .eq('is_deleted', false);

        if (error) throw error;

        patientsCache = data.map(p => ({
            id: p.id_paciente,
            nombre: p.nombre,
            apellido: p.apellido,
            documento: p.documento,
            nombreCompletoClean: cleanText(`${p.nombre} ${p.apellido}`),
            nombreInvertidoClean: cleanText(`${p.apellido} ${p.nombre}`),
            apellidoClean: cleanText(p.apellido),
            nombreClean: cleanText(p.nombre)
        }));

        console.log(`✅ Cargados ${patientsCache.length} pacientes desde la base de datos.`);
        return patientsCache;
    } catch (err) {
        console.error('❌ Error al cargar pacientes de Supabase:', err.message);
        return [];
    }
}

/**
 * Busca un paciente que coincida con el nombre del archivo
 */
function matchPatient(fileName) {
    const cleanFileName = cleanText(fileName);
    if (!cleanFileName) return null;

    // 1. Coincidencia por nombre completo exacto (Nombre Apellido o Apellido Nombre)
    for (const patient of patientsCache) {
        if (cleanFileName.includes(patient.nombreCompletoClean) || cleanFileName.includes(patient.nombreInvertidoClean)) {
            return patient;
        }
    }

    // 2. Coincidencia por Apellido + Nombre individuales (por si hay palabras en medio)
    for (const patient of patientsCache) {
        if (patient.apellidoClean.length > 2 && patient.nombreClean.length > 2) {
            if (cleanFileName.includes(patient.apellidoClean) && cleanFileName.includes(patient.nombreClean)) {
                return patient;
            }
        }
    }

    // 3. Intento heurístico por partes de nombres separados por guión o espacios
    const parts = cleanFileName.split(/\s+|_|-/);
    for (const patient of patientsCache) {
        const ln = patient.apellidoClean;
        const fn = patient.nombreClean;
        if (ln.length > 3 && fn.length > 3) {
            if (parts.includes(ln) && parts.includes(fn)) {
                return patient;
            }
        }
    }

    return null;
}

/**
 * Determina a qué subcarpeta clínica debe ir el archivo según su extensión y nombre
 */
function getTargetSubfolder(fileName) {
    const cleanName = fileName.toLowerCase();

    // Reglas de Tomografía/RX por palabra clave (tienen prioridad sobre imágenes comunes)
    if (cleanName.includes('tomografia') || 
        cleanName.includes('rx') || 
        cleanName.includes('radiografia') || 
        cleanName.includes('panoramica') || 
        cleanName.includes('pano') || 
        cleanName.includes('dicom') ||
        cleanName.endsWith('.cr2') ||
        cleanName.endsWith('.dcm')) {
        return SUBFOLDERS.ESTUDIOS;
    }

    // Clasificación estándar por extensiones
    if (CLASSIFICATION_RULES.EXOCAD.test(fileName) || cleanName.includes('dentalcad') || cleanName.includes('exocad')) {
        return SUBFOLDERS.EXOCAD;
    }
    if (CLASSIFICATION_RULES.ESCANEOS.test(fileName)) {
        return SUBFOLDERS.ESCANEOS;
    }
    if (CLASSIFICATION_RULES.FOTOS.test(fileName)) {
        // Ignorar si es captura de pantalla de exocad
        if (cleanName.includes('screenshot') && (cleanName.includes('cad') || cleanName.includes('exocad'))) {
            return SUBFOLDERS.EXOCAD;
        }
        return SUBFOLDERS.FOTOS;
    }
    if (CLASSIFICATION_RULES.VIDEOS.test(fileName)) {
        return SUBFOLDERS.VIDEOS;
    }
    if (CLASSIFICATION_RULES.DOCUMENTOS.test(fileName)) {
        return SUBFOLDERS.DOCUMENTOS;
    }

    return SUBFOLDERS.DOCUMENTOS; // Clasificación por defecto
}

/**
 * Crea las carpetas físicas para un paciente si no existen
 */
function ensurePatientFolders(patient) {
    // Formato premium de carpeta: "Apellido, Nombre"
    const patientFolderName = `${patient.apellido}, ${patient.nombre}`;
    const patientPath = path.join(PACIENTES_DIR, patientFolderName);

    if (!fs.existsSync(patientPath)) {
        fs.mkdirSync(patientPath, { recursive: true });
        console.log(`📁 Creada carpeta principal para paciente: "${patientFolderName}"`);
    }

    // Crear subcarpetas
    for (const key in SUBFOLDERS) {
        const subPath = path.join(patientPath, SUBFOLDERS[key]);
        if (!fs.existsSync(subPath)) {
            fs.mkdirSync(subPath, { recursive: true });
        }
    }

    return patientPath;
}

/**
 * Mueve un archivo de forma segura evitando sobrescribir
 */
function safeMove(srcPath, destDir, fileName) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    let destPath = path.join(destDir, fileName);
    
    // Si ya existe un archivo con ese nombre, agregamos un sufijo contador
    if (fs.existsSync(destPath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let counter = 1;
        
        while (fs.existsSync(path.join(destDir, `${base}_${counter}${ext}`))) {
            counter++;
        }
        
        fileName = `${base}_${counter}${ext}`;
        destPath = path.join(destDir, fileName);
    }

    try {
        fs.renameSync(srcPath, destPath);
        console.log(`➡️  Mapeado: "${path.basename(srcPath)}" ➜ "${path.relative(DRIVE_ROOT, destPath)}"`);
        return destPath;
    } catch (err) {
        console.error(`❌ Error al mover "${fileName}":`, err.message);
        return null;
    }
}

/**
 * Maneja la lógica de enlaces simbólicos para proyectos de Exocad
 * Almacena el proyecto Exocad en el Paciente y crea un symlink en PROYECTOS_EXOCAD
 */
function handleExocadSymlink(projectPath, patient, projectName) {
    if (!fs.existsSync(PROYECTOS_EXOCAD_DIR)) {
        fs.mkdirSync(PROYECTOS_EXOCAD_DIR, { recursive: true });
    }

    // Ruta real (física) en el paciente
    const realDest = path.join(PACIENTES_DIR, `${patient.apellido}, ${patient.nombre}`, SUBFOLDERS.EXOCAD, projectName);
    
    // Si la carpeta real ya está en el destino, o la movemos allí
    let finalProjectPath = projectPath;
    if (projectPath !== realDest) {
        finalProjectPath = safeMove(projectPath, path.dirname(realDest), projectName);
    }

    if (!finalProjectPath) return;

    // Crear el enlace simbólico en PROYECTOS_EXOCAD
    const symlinkPath = path.join(PROYECTOS_EXOCAD_DIR, projectName);

    try {
        // Eliminar link existente si lo hubiera para evitar fallas
        if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
            fs.unlinkSync(symlinkPath);
        }
    } catch (e) {
        // Ignorar si no existe
    }

    try {
        fs.symlinkSync(finalProjectPath, symlinkPath, 'dir');
        console.log(`🔗 Enlace Simbólico Creado: PROYECTOS_EXOCAD/"${projectName}" ➜ Paciente "${patient.apellido}, ${patient.nombre}"`);
    } catch (err) {
        console.error(`❌ No se pudo crear enlace simbólico para Exocad:`, err.message);
    }
}

/**
 * Escanea y clasifica todos los archivos de la raíz
 * @param {boolean} dryRun - Si es true, solo simula y escribe el reporte sin mover nada
 */
async function organizeDrive(dryRun = true) {
    if (patientsCache.length === 0) {
        await loadPatients();
    }

    console.log(`🚀 Iniciando organización de Google Drive (DRY RUN = ${dryRun})...`);

    // Crear carpetas de sistema
    if (!dryRun) {
        if (!fs.existsSync(PACIENTES_DIR)) fs.mkdirSync(PACIENTES_DIR, { recursive: true });
        if (!fs.existsSync(PROYECTOS_EXOCAD_DIR)) fs.mkdirSync(PROYECTOS_EXOCAD_DIR, { recursive: true });
        if (!fs.existsSync(POR_CLASIFICAR_DIR)) fs.mkdirSync(POR_CLASIFICAR_DIR, { recursive: true });
    }

    const items = fs.readdirSync(DRIVE_ROOT);
    const report = {
        mapped: [],
        unmapped: [],
        exocadProjects: [],
        errors: []
    };

    // Colección de archivos Exocad sueltos para agrupar por proyecto
    const exocadFilesByProject = {};

    for (const item of items) {
        const itemPath = path.join(DRIVE_ROOT, item);
        const stat = fs.lstatSync(itemPath);

        // Ignorar las carpetas del sistema
        if (item === 'PACIENTES' || item === 'PROYECTOS_EXOCAD' || item === 'POR_CLASIFICAR' || item.startsWith('.')) {
            continue;
        }

        // Caso A: Carpetas (pueden ser proyectos de Exocad o carpetas de pacientes)
        if (stat.isDirectory()) {
            const patient = matchPatient(item);
            
            // Si es un directorio y tiene archivos Exocad dentro, se trata como proyecto Exocad
            const isExocadProj = fs.readdirSync(itemPath).some(file => CLASSIFICATION_RULES.EXOCAD.test(file));

            if (patient) {
                if (isExocadProj) {
                    report.exocadProjects.push({ src: item, patient, type: 'Folder' });
                    if (!dryRun) {
                        handleExocadSymlink(itemPath, patient, item);
                    }
                } else {
                    // Es carpeta de paciente suelta, la movemos a la carpeta consolidada PACIENTES
                    report.mapped.push({ src: item, dest: `PACIENTES/${patient.apellido}, ${patient.nombre}`, type: 'Folder' });
                    if (!dryRun) {
                        safeMove(itemPath, PACIENTES_DIR, `${patient.apellido}, ${patient.nombre}`);
                    }
                }
            } else {
                report.unmapped.push({ src: item, reason: 'No se identificó el nombre del paciente en la carpeta', type: 'Folder' });
                if (!dryRun) {
                    safeMove(itemPath, POR_CLASIFICAR_DIR, item);
                }
            }
        } 
        // Caso B: Archivos sueltos en la raíz
        else if (stat.isFile() || stat.isSymbolicLink()) {
            const patient = matchPatient(item);
            
            if (patient) {
                const subfolder = getTargetSubfolder(item);
                const destRel = `PACIENTES/${patient.apellido}, ${patient.nombre}/${subfolder}`;
                
                report.mapped.push({ src: item, dest: destRel, type: 'File' });

                if (!dryRun) {
                    const patientPath = ensurePatientFolders(patient);
                    const destDir = path.join(patientPath, subfolder);
                    const movedPath = safeMove(itemPath, destDir, item);

                    // Si es un archivo de Exocad individual, verificamos si necesita vincularse
                    if (subfolder === SUBFOLDERS.EXOCAD && movedPath) {
                        // Crear enlace para el archivo Exocad suelto si es necesario
                        const projectName = path.basename(item, path.extname(item));
                        // Si es un archivo principal de proyecto (.dentalCAD, .dentalProject)
                        if (item.endsWith('.dentalCAD') || item.endsWith('.dentalProject')) {
                            // Crear un enlace directo al archivo o a su contenedor
                            const symlinkPath = path.join(PROYECTOS_EXOCAD_DIR, item);
                            try {
                                if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
                                fs.symlinkSync(movedPath, symlinkPath, 'file');
                            } catch (e) {}
                        }
                    }
                }
            } else {
                report.unmapped.push({ src: item, reason: 'Nombre de paciente no detectado en el archivo', type: 'File' });
                if (!dryRun) {
                    safeMove(itemPath, POR_CLASIFICAR_DIR, item);
                }
            }
        }
    }

    // Escribir reporte en scratch/simulacion_orden.md
    const scratchDir = path.join(__dirname, '../scratch');
    if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
    }

    let md = `# Reporte de Simulación de Organización de Google Drive (Dry Run)\n\n`;
    md += `Generado el: ${new Date().toLocaleString()}\n\n`;
    md += `El script analizó la raíz de Google Drive y propone los siguientes movimientos de forma 100% segura (ningún archivo se eliminará).\n\n`;
    
    md += `## 📊 Resumen Estadístico\n`;
    md += `- **Elementos a Mapear con Pacientes:** ${report.mapped.length + report.exocadProjects.length}\n`;
    md += `- **Proyectos Exocad Detectados:** ${report.exocadProjects.length}\n`;
    md += `- **Elementos sin clasificar (irán a POR_CLASIFICAR):** ${report.unmapped.length}\n\n`;

    md += `## 📂 Movimientos Propuestos a Pacientes\n`;
    md += `| Elemento Original | Tipo | Carpeta Destino | Paciente Detectado |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    
    report.mapped.forEach(item => {
        md += `| \`${item.src}\` | ${item.type} | \`${item.dest}\` | ✅ Matched |\n`;
    });

    report.exocadProjects.forEach(item => {
        md += `| \`${item.src}\` | Proyecto Exocad (Folder) | \`PACIENTES/${item.patient.apellido}, ${item.patient.nombre}/${SUBFOLDERS.EXOCAD}\` y Enlace en \`PROYECTOS_EXOCAD\` | ✅ Exocad Proj |\n`;
    });

    md += `\n## 📥 Bandeja de Entrada (Elementos a POR_CLASIFICAR para orden manual)\n`;
    md += `| Elemento Original | Tipo | Razón de Clasificación Manual |\n`;
    md += `| :--- | :--- | :--- |\n`;
    
    report.unmapped.forEach(item => {
        md += `| \`${item.src}\` | ${item.type} | ${item.reason} |\n`;
    });

    const reportPath = path.join(scratchDir, 'simulacion_orden.md');
    fs.writeFileSync(reportPath, md);
    console.log(`📝 Reporte de simulación guardado con éxito en: ${reportPath}`);

    return report;
}

/**
 * Ejecuta el watcher en tiempo real sobre la raíz de Drive y PACIENTES
 */
async function runWatcher() {
    if (patientsCache.length === 0) {
        await loadPatients();
    }

    console.log('\n👁️  Iniciando Guardián (Watcher) de Google Drive en tiempo real...');
    console.log(`📂 Vigilando carpeta raíz: "${DRIVE_ROOT}"`);
    console.log(`📂 Vigilando carpeta pacientes: "${PACIENTES_DIR}"`);
    console.log('🤖 Cualquier archivo o fotos que arrastres se ordenará automáticamente al instante.\n');

    // Cola de procesamiento para evitar loops y conflictos de escritura concurrentes
    const processingQueue = new Set();

    /**
     * Procesa un archivo modificado o añadido
     */
    const processFile = async (filePath) => {
        if (processingQueue.has(filePath)) return;
        processingQueue.add(filePath);

        // Esperar 2 segundos para dar tiempo a que termine la escritura del archivo (sobre todo por Google Drive sync)
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            if (!fs.existsSync(filePath)) {
                processingQueue.delete(filePath);
                return;
            }

            const fileName = path.basename(filePath);
            const parentDir = path.dirname(filePath);

            // Ignorar archivos de sistema y temporales
            if (fileName.startsWith('.') || fileName.startsWith('~') || processingQueue.has(fileName)) {
                processingQueue.delete(filePath);
                return;
            }

            // Evitar loops: Si el archivo ya está dentro de una de las subcarpetas de PACIENTES, ignorar
            const relToPacientes = path.relative(PACIENTES_DIR, filePath);
            if (!relToPacientes.startsWith('..') && !path.isAbsolute(relToPacientes)) {
                const pathParts = relToPacientes.split(path.sep);
                // Si está más profundo que el primer nivel (es decir, ya dentro de la carpeta del paciente y en su subcarpeta)
                if (pathParts.length > 2) {
                    processingQueue.delete(filePath);
                    return;
                }
            }

            // Escanear si está en la raíz de Google Drive o directamente en la raíz de un Paciente
            const patient = matchPatient(fileName) || matchPatient(path.basename(parentDir));

            if (patient) {
                const subfolder = getTargetSubfolder(fileName);
                const patientPath = ensurePatientFolders(patient);
                const destDir = path.join(patientPath, subfolder);
                
                console.log(`\n✨ Auto-Clasificador: Detectado "${fileName}"`);
                const finalPath = safeMove(filePath, destDir, fileName);

                // Si es un proyecto de Exocad
                const cleanName = fileName.toLowerCase();
                const isExocad = CLASSIFICATION_RULES.EXOCAD.test(fileName) || cleanName.includes('dentalcad');
                
                if (isExocad && finalPath) {
                    const projectName = path.basename(fileName, path.extname(fileName));
                    // Si es un archivo de proyecto, intentamos enlazarlo en PROYECTOS_EXOCAD
                    if (fileName.endsWith('.dentalCAD') || fileName.endsWith('.dentalProject')) {
                        const symlinkPath = path.join(PROYECTOS_EXOCAD_DIR, fileName);
                        try {
                            if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
                            fs.symlinkSync(finalPath, symlinkPath, 'file');
                            console.log(`🔗 Enlace CAD creado: PROYECTOS_EXOCAD/"${fileName}"`);
                        } catch (e) {}
                    }
                }
            }
        } catch (err) {
            console.error('❌ Error en el watcher al procesar archivo:', err.message);
        } finally {
            processingQueue.delete(filePath);
        }
    };

    // Usar fs.watch nativo con opción recursiva para macOS (altamente eficiente)
    fs.watch(DRIVE_ROOT, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(DRIVE_ROOT, filename);

        // Ignorar si el archivo está en carpetas internas del sistema
        if (filename.startsWith('PACIENTES/') && filename.split('/').length > 3) {
            // Ya está ordenado adentro
            return;
        }
        if (filename.startsWith('PROYECTOS_EXOCAD') || filename.startsWith('POR_CLASIFICAR') || filename.startsWith('.')) {
            return;
        }

        if (eventType === 'rename') {
            // Un evento rename ocurre al crear, renombrar o mover archivos
            if (fs.existsSync(fullPath)) {
                const stat = fs.lstatSync(fullPath);
                if (stat.isFile() || stat.isSymbolicLink()) {
                    processFile(fullPath);
                }
            }
        }
    });
}

// Lógica de ejecución por línea de comandos
const args = process.argv.slice(2);
if (args.includes('--organize')) {
    organizeDrive(false);
} else if (args.includes('--watch')) {
    runWatcher();
} else {
    // Por defecto, ejecuta la simulación (Dry Run)
    organizeDrive(true).then(() => {
        console.log('\n💡 Simulación finalizada. Revisa el reporte en scratch/simulacion_orden.md');
        console.log('Para ejecutar la organización real, usa: npm run drive:organize');
    });
}

module.exports = { organizeDrive, runWatcher };
