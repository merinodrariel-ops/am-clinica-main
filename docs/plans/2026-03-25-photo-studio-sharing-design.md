### Task Contract — Photo Studio sharing UX — 2026-03-25

**Goal:** Unificar y acelerar el flujo de compartir fotos editadas desde Photo Studio, incluyendo seleccion multiple, AirDrop por lote y envio programado al paciente por WhatsApp o email.

**In scope:**
- Agregar seleccion multiple real en miniaturas del lateral izquierdo (`Shift + click`, `Cmd/Ctrl + click`, estado visual de seleccion).
- Definir comportamiento del menu contextual sobre miniaturas para acciones de compartir.
- Unificar desde Photo Studio el compartir por AirDrop y el compartir con paciente.
- Reutilizar/extender el flujo existente de WhatsApp/email con mensaje sugerido y programacion.
- Garantizar que el contenido compartido refleje lo que el usuario ve, aunque no este guardado en Drive.

**Out of scope:**
- Cambios en RLS, triggers o estructura SQL.
- Rediseño completo de `ShareWithPatientModal` fuera de lo necesario para soportar multiples imagenes.
- Cambios en otros modulos de Drive no relacionados con Photo Studio y preview de imagenes.

**Modulo owner:** frontend / patient drive / photo studio.

**Constraints:**
- No romper preview simple ni acciones existentes de duplicado/guardado.
- Sin migraciones destructivas.
- Mantener el flujo de WhatsApp/email programado con sugerencia de Google Reviews.
- Reflejar la version editada visible, incluso si aun no fue guardada en Drive.
- Conservar la distincion entre compartir rapido al dispositivo y compartir asistido al paciente.

**Requiere aprobacion humana para:**
- [ ] Migracion SQL en produccion
- [ ] Cambios a RLS/triggers
- [ ] Cambios a AuthContext o middleware
- [ ] Push a main sin CI

**Archivos probablemente afectados:**
- `components/patients/drive/PhotoStudioModal.tsx` - seleccion multiple, menu contextual, export por lote, disparadores de compartir.
- `components/patients/drive/ShareWithPatientModal.tsx` - soporte para lote de imagenes/exportables desde editor.
- `components/patients/drive/DrivePreviewModal.tsx` - pasaje de datos necesarios al editor.
- `components/patients/drive/PatientDriveTab.tsx` - origen de `patientId`/`patientName` y reutilizacion del flujo de compartir existente.

**Risk level:** medio.

**Definition of Done:**
- [ ] Seleccion multiple usable desde miniaturas con `Shift + click` y `Cmd/Ctrl + click`
- [ ] Menu contextual de miniaturas con `Duplicar foto`, `Compartir por AirDrop` y `Compartir con paciente`
- [ ] AirDrop comparte una o varias fotos segun el contexto/seleccion
- [ ] Compartir con paciente abre flujo de WhatsApp/email programado usando las imagenes visibles/exportadas
- [ ] El contenido compartido refleja las ediciones locales visibles
- [ ] Build pasa (`npm run build`)
- [ ] Sin violaciones de guardrails (categoria, cliente Supabase, timezone)
- [ ] Probado en UI
- [ ] Handoff output completado

---

## Resumen del problema

Hoy hay una inconsistencia fuerte entre donde se edita la foto y donde se comparte. Desde `PhotoStudioModal` existe un boton `Compartir` que solo dispara share nativo/AirDrop. En cambio, el flujo `Compartir con el paciente` ya existe fuera del editor, en la grilla/preview, mediante `ShareWithPatientModal`. Esto obliga a salir del contexto de trabajo justo cuando el usuario ya tiene lista la imagen editada.

Ademas, el lateral izquierdo del editor muestra miniaturas, pero no ofrece seleccion multiple real. Aunque existe un modo de seleccion, no responde al gesto esperado por el usuario (`Shift`) ni permite un flujo rapido para compartir varias fotos juntas. Eso hace lento el caso principal: mandar varias imagenes antes/despues de una sola vez.

---

## Enfoques evaluados

### 1. Recomendado — menu contextual en miniaturas + seleccion multiple real

Agregar un menu contextual rico sobre las miniaturas del lateral izquierdo. Ese menu deja de tener solo `Duplicar foto` y pasa a ser el centro de acciones del item o del grupo seleccionado: `Duplicar foto`, `Compartir por AirDrop`, `Compartir con paciente`.

La seleccion multiple se vuelve nativa y predecible:
- click normal: abre/cambia foto activa
- `Shift + click`: selecciona rango desde el ultimo ancla
- `Cmd/Ctrl + click`: suma o quita individuales

Si hay varias fotos seleccionadas y el usuario abre el menu contextual sobre una de ellas, las acciones aplican a todo el grupo. Si no hay seleccion multiple, aplican a una sola foto.

**Ventajas:** coincide con el modelo mental del usuario, usa la ubicacion mas natural, evita recargar la toolbar superior y mejora tanto productividad como descubribilidad.

**Desventajas:** requiere mas logica de estado en `PhotoStudioModal`.

### 2. Toolbar superior expandida

Mantener todo en la barra superior con botones o un dropdown de compartir que resuelva AirDrop y paciente.

**Ventajas:** implementacion mas directa.

**Desventajas:** no resuelve por si sola el problema del clic derecho en miniaturas, sigue lejos del lugar donde el usuario piensa la accion, y recarga mas la barra principal.

### 3. Acciones mixtas: toolbar + miniaturas

Dejar el share general arriba y agregar algunas acciones tambien al clic derecho.

**Ventajas:** maxima redundancia.

**Desventajas:** dispersa la UX y genera dos lugares para aprender casi lo mismo.

**Decision:** implementar el enfoque 1.

---

## Diseno validado

### 1. Interaccion de seleccion en miniaturas

El lateral izquierdo pasa a funcionar como una tira de seleccion real, no solo de navegacion.

- **Click simple:** abre la foto clickeada y limpia seleccion multiple salvo que ya se este operando sobre una seleccion persistente.
- **`Shift + click`:** selecciona un rango entre la ultima miniatura ancla y la miniatura actual.
- **`Cmd/Ctrl + click`:** agrega o remueve una miniatura de la seleccion actual.
- **Indicador visual:** las miniaturas seleccionadas deben verse claramente activas, y la UI debe mostrar la cantidad seleccionada cuando sea mayor a 1.

Si el usuario no selecciono multiples fotos, el comportamiento general sigue siendo el actual para no romper velocidad ni costumbre.

### 2. Menu contextual sobre miniaturas

El clic derecho sobre una miniatura abre un menu contextual con estas opciones:

- `Duplicar foto`
- `Compartir por AirDrop`
- `Compartir con paciente`

Regla de aplicacion:
- si la miniatura clickeada no esta dentro de una seleccion multiple, la accion aplica solo a esa foto;
- si la miniatura clickeada forma parte de una seleccion multiple, la accion aplica a todo el grupo seleccionado.

Esto vuelve consistente el flujo y evita que el usuario tenga que mover la atencion hacia la barra superior para compartir.

### 3. Compartir por AirDrop / share nativo

La opcion `Compartir por AirDrop` usa `navigator.share` cuando el browser lo soporta. Si hay una sola foto seleccionada, comparte una. Si hay varias, comparte el lote completo.

La fuente del archivo compartido no es necesariamente Drive. Cada foto se resuelve asi:
- si la foto tiene una version editada/local visible en el editor, se exporta esa version;
- si no tiene cambios locales, se usa la original.

Esto asegura que el usuario comparta exactamente lo que esta viendo, incluso si aun no guardo.

Fallback:
- si el navegador no soporta share nativo de archivos, se mantiene un fallback seguro de descarga, idealmente por lote cuando sea viable o secuencial con feedback claro.

### 4. Compartir con paciente

La opcion `Compartir con paciente` abre el flujo asistido existente, extendido para trabajar con multiples imagenes exportadas desde el editor.

Canales:
- WhatsApp
- Email

Capacidades:
- programar envio (no solo enviar ahora)
- autocompletar telefono/email del paciente
- mensaje sugerido editable
- sugerencia de Google Reviews incluida si existe URL configurada

Cuando el usuario inicia esta accion desde Photo Studio, el flujo debe trabajar con las imagenes exportadas del contexto actual, no con la version guardada en Drive. Asi se respeta el objetivo principal: mandar antes/despues rapido, con la edicion visible final.

### 5. Mensaje sugerido

Se mantiene la idea actual del copy amigable y se refuerza el objetivo de negocio.

El mensaje por defecto debe:
- sonar cercano y profesional
- mencionar que se envian las fotos del tratamiento
- invitar de forma natural a compartir la experiencia en Google Reviews
- seguir siendo editable antes de programar

### 6. Jerarquia de acciones

La barra superior puede conservar un boton general de compartir como acceso secundario, pero la accion principal para foto individual o lote pasa a vivir en el clic derecho de miniaturas. Esa es la ubicacion recomendada por el usuario y la mas coherente con el flujo real.

---

## Arquitectura y flujo tecnico

1. `PatientDriveTab` sigue siendo el origen de `patientId` y `patientName`.
2. `DrivePreviewModal` pasa ese contexto a `PhotoStudioModal`.
3. `PhotoStudioModal` administra:
   - foto activa
   - ancla de seleccion para `Shift`
   - conjunto de ids seleccionados
   - menu contextual de miniaturas
   - resolucion/export de una o multiples imagenes visibles
4. `ShareWithPatientModal` se extiende para aceptar un lote de imagenes exportables y no depender solo de un `DriveFile` singular.
5. El share nativo y el share con paciente usan la misma capa de resolucion de archivos visibles/exportados para evitar divergencias.

---

## Riesgos y mitigaciones

- **Riesgo:** mezclar seleccion multiple con navegacion activa puede resultar confuso.
  **Mitigacion:** reglas simples y consistentes (`click`, `Shift + click`, `Cmd/Ctrl + click`) y estados visuales claros.

- **Riesgo:** exportar varias imagenes editadas puede ser costoso o lento.
  **Mitigacion:** feedback de carga por lote y reutilizacion del pipeline de export ya existente.

- **Riesgo:** el flujo existente de paciente hoy parece pensado para un solo archivo.
  **Mitigacion:** extender el modal de forma incremental, manteniendo compatibilidad con el caso singular.

- **Riesgo:** diferencias entre share nativo de una imagen y multiples archivos segun navegador.
  **Mitigacion:** detectar capacidades con `navigator.canShare`, con fallback controlado.

---

## Validacion esperada

- Seleccionar una foto y compartir por AirDrop desde clic derecho.
- Seleccionar rango con `Shift + click` y compartir multiples por AirDrop.
- Seleccionar multiples con `Cmd/Ctrl + click` y compartir al paciente.
- Confirmar que una foto con edicion no guardada se comparte/exporta tal como se ve.
- Confirmar que el modal de paciente sigue sugiriendo mensaje y Google Reviews.
- Confirmar que una foto sin seleccion multiple sigue funcionando igual que hoy.

---

## Handoff Output — Photo Studio sharing UX — 2026-03-25

**Estado final:** DISENO VALIDADO

**Archivos tocados:**
- `docs/plans/2026-03-25-photo-studio-sharing-design.md` (documentacion del diseno aprobado)

**Que cambio y por que:**
Se documento el diseno aprobado para unificar el flujo de compartir desde Photo Studio: seleccion multiple real en miniaturas, menu contextual con acciones de compartir y soporte para enviar al paciente usando la version visible/editada de las fotos.

**Risks encontrados:**
- Complejidad de estado en `PhotoStudioModal`
- Extension del modal de compartir al paciente para multiples imagenes

**Por que es seguro:**
Todavia no se implementaron cambios de codigo; el documento delimita scope, riesgos y reglas antes de tocar funcionalidad.

**Validacion ejecutada:**
- Revision de contexto y componentes existentes -> completada
- Validacion conversacional con usuario -> aprobada

**Trabajo restante:**
- Crear plan de implementacion detallado
- Implementar UI + export + modal de compartir multiple
- Validar en UI y build

**Proximo agente recomendado:**
- Tipo: frontend
- Accion: implementar seleccion multiple, menu contextual y flujos de compartir segun este diseno
