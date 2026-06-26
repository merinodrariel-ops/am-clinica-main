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

## Notas

- No se incluye ningún secreto real.
- Si ya existe `node_modules`, el script igual intenta usarlo sin tocar nada raro.
- Para producción local:

```powershell
npm run build
npm start
```
