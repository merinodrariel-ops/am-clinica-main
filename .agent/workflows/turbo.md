---
description: Ejecución automática de tareas críticas (Seguridad, Commit, Push y Vercel)
---
// turbo-all

### 🚀 Modo Automático (High Performance)

Este flujo permite que la IA avance rápidamente en tareas de mantenimiento y despliegue sin pedir confirmación en cada paso.

#### 1. Auditoría de Seguridad Silenciosa
Ejecutar el escaneo de seguridad con RuFlo en modo automático:
```bash
ruflo security scan --interactive false
```

#### 2. Sincronización de Cambios
Realizar git add y commit automático. Usar un mensaje descriptivo basado en la tarea actual.
```bash
git add .
git commit -m "chore: [auto-task] sync and secure patterns"
git push origin main
```

#### 3. Verificación de Despliegue (Vercel)
Verificar el estado del último deploy en Vercel.
```bash
npx vercel ls
```

#### 4. Notificación Final
Resumir el trabajo realizado y confirmar que el "Modo Turbo" ha completado la misión.
