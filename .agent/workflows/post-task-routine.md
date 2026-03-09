---
description: Rutina obligatoria post-tarea (Commit, Push y Vercel)
---

### 🚨 Objetivo
Asegurar que cada gran tarea terminada esté disponible online y sin errores en Vercel antes de marcarla como finalizada.

### 📝 Pasos obligatorios

1. **Validación Local Final**
   - Ejecutar `npm run build` para asegurar que no hay errores de compilación.
   - Verificar en local que la funcionalidad cumple con lo solicitado.

2. **Commit & Push**
   - Realizar git add, commit y push a la rama correspondiente (usualmente `main`).
   ```bash
   git add .
   git commit -m "[descripción concisa del cambio]"
   git push origin main
   ```

3. **Verificación en Vercel**
   - Entrar al dashboard de Vercel o monitorear el log de deployment.
   - **IMPORTANTE:** Una vez desplegado, abrir la URL de producción y PROBAR la funcionalidad allí.
   - Si hay errores en Vercel que no estaban en local (ej. variables de entorno faltantes o errores de SSR), corregirlos inmediatamente.

4. **Confirmación al Usuario**
   - En el mensaje de finalización, confirmar explícitamente que la versión online ya está disponible y fue verificada.
