# AM Clínica - Windows setup

Este paquete contiene los archivos que faltan para levantar la app en una PC nueva con Windows.

## Requisitos

- Node.js 20 o superior
- npm
- Acceso a las credenciales de Supabase, Google, Resend, Notion, Gemini, Vercel, etc.

## Pasos

1. Clonar el repositorio o copiar esta carpeta junto al repo.
2. Renombrar `.env.local.example` a `.env.local`.
3. Completar los valores de `.env.local`.
4. Abrir PowerShell en la carpeta del proyecto.
5. Ejecutar:

```powershell
npm install
npm run dev
```

La app queda disponible en `http://localhost:3000`.

## Atajos

- `start-windows.bat`: instala dependencias si hace falta y levanta el servidor.
- `start-windows.ps1`: la misma rutina, pensada para PowerShell.

## Exocad en Windows

Para que la app pueda abrir proyectos CAD con el protocolo
`am-clinica-exocad://open/`, completar estos pasos en la PC Windows donde esta
instalado Exocad:

1. Copiar `exocad-config.example.json` como `exocad-config.json`.
2. Editar `exocad-config.json` con:
   - `googleDrivePath`: carpeta raiz sincronizada de Google Drive donde viven las carpetas de pacientes.
   - `exocadAppPath`: ruta completa al ejecutable CAD configurado, por ejemplo el `.exe` dentro de `DentalCADApp/bin`.
3. Registrar el protocolo desde PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\windows-portable-pack\install-exocad-protocol.ps1
```

El handler soporta carpetas con corchetes como `[EXOCAD]`, decodifica URLs del
protocolo y abre el ejecutable indicado en `exocad-config.json` usando como
directorio de trabajo la carpeta `bin` del ejecutable.

## Notas

- No se incluye ningún secreto real.
- Si ya existe `node_modules`, el script igual intenta usarlo sin tocar nada raro.
- No hardcodear `DentalDB.exe`: la app CAD se toma siempre desde `exocad-config.json`.
- Para producción local:

```powershell
npm run build
npm start
```
