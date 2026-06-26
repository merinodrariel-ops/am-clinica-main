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

