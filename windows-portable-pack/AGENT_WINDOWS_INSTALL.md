# Instructivo para agente en Windows

Objetivo: levantar AM Clinica localmente en una PC Windows nueva, usando un repo ya clonado.

## 1. Verificar requisitos

Abrir PowerShell en la carpeta del repo y ejecutar:

```powershell
node -v
npm -v
git status
```

Usar Node.js 20 o superior.

## 2. Copiar archivos sensibles

Desde este paquete, copiar estos archivos a la raiz del repo clonado:

```text
.env.local
.env
.env.cli
.env.vercel
.mcp.json
google_client_secret.json
mcp_google_drive.sh
opencode.json
```

No imprimir ni pegar el contenido de estos archivos en chats, logs o commits.

## 3. Instalar dependencias

```powershell
npm install
```

## 4. Levantar la app local

```powershell
npm run dev
```

Abrir:

```text
http://localhost:3000
```

## 5. Validar funcionamiento

Revisar:

```text
http://localhost:3000/login
http://localhost:3000/dashboard
http://localhost:3000/caja-recepcion
http://localhost:3000/caja-admin
```

Si el login redirige o falla, confirmar que `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` esten en `.env.local`.

## 6. Build local opcional

```powershell
npm run build
npm start
```

## 7. Reglas de seguridad

- No commitear `.env*`, `.mcp.json` ni `google_client_secret.json`.
- No compartir claves por chat.
- Si se copia el paquete a otra maquina, borrarlo cuando termine la instalacion.
- Si Windows bloquea PowerShell scripts, usar `start-windows.bat`.

## 8. Setup Exocad / protocolo CAD

Objetivo: dejar funcionando el link de la app:

```text
am-clinica-exocad://open/?patientFolder=[nombre]&path=[ruta]
```

### Para humanos

1. Copiar `windows-portable-pack/exocad-config.example.json` a
   `windows-portable-pack/exocad-config.json`.
2. Completar `googleDrivePath` con la carpeta raiz de Google Drive donde estan
   los pacientes.
3. Completar `exocadAppPath` con el ejecutable CAD correcto instalado en esa PC.
   No asumir `DentalDB.exe`: usar el `.exe` real que corresponda a esa
   instalacion.
4. Ejecutar en PowerShell desde la raiz del repo:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\windows-portable-pack\install-exocad-protocol.ps1
```

5. Probar un link real desde la app y confirmar que abre el proyecto en Exocad.

### Para agentes / implementacion tecnica obligatoria

- En PowerShell, los corchetes `[` y `]` son comodines. Cualquier acceso a rutas
  que puedan incluir carpetas como `[EXOCAD]` debe usar `-LiteralPath`, no
  `-Path`:

```powershell
Test-Path -LiteralPath $path
Get-Item -LiteralPath $path
Get-ChildItem -LiteralPath $path
Copy-Item -LiteralPath $src -Destination $dest
```

- El protocolo recibe una URL con query params. Extraer y decodificar
  `patientFolder` y `path` con regex y
  `[System.Uri]::UnescapeDataString`:

```powershell
patientFolder=([^&]+)
path=([^&]+)
```

- La ruta final del proyecto se compone asi:

```text
googleDrivePath + patientFolder (si existe) + path
```

- El ejecutable CAD debe leerse dinamicamente desde `exocad-config.json` en la
  clave `exocadAppPath`. No hardcodear `DentalDB.exe`.
- Al lanzar la app CAD, pasar el proyecto como argumento y establecer
  obligatoriamente `-WorkingDirectory` en la carpeta `bin` del ejecutable, para
  que cargue bien el emulador de dongle y sus dependencias.
