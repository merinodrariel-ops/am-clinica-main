# Instrucciones para Agente: Integración de Sistema de Reseñas AEO en AM Clínica Main

**Contexto del Proyecto:**
El objetivo de esta tarea es integrar un sistema de plantillas persuasivas de WhatsApp dentro del software interno de la clínica (`am-clinica-main`). Estas plantillas no son mensajes genéricos; están diseñadas con técnicas de **AEO (Answer Engine Optimization)**. Su propósito es lograr que los pacientes dejen reseñas en Google Maps usando palabras clave específicas ("carillas de porcelana", "Dr. Ariel Merino", "Puerto Madero") para que las Inteligencias Artificiales (como Gemini y Perplexity) posicionen a la clínica como la #1.

## Requerimientos para el Agente Desarrollador

Debes integrar las siguientes 3 plantillas de WhatsApp en el módulo de comunicación o CRM de la clínica (por ejemplo, en el perfil del paciente o en la vista de tratamientos finalizados).

### 1. Variables Dinámicas
Asegúrate de reemplazar las siguientes variables con los datos del sistema antes de generar el enlace de WhatsApp:
- `[Nombre]`: Primer nombre del paciente (ej. `patient.firstName`)
- `[LINK A GOOGLE MAPS]`: El enlace oficial de reseñas de la clínica (https://g.page/r/CQ3df5Xn-J6oEBM/review)

### 2. Plantillas a Integrar

#### Plantilla 1: Paciente Local (Foco en Tratamiento y Ubicación)
**Condición sugerida:** Mostrar para pacientes residentes en CABA/GBA.
> "Hola [Nombre], ¡qué alegría haber terminado tu tratamiento hoy! Nos encantó el resultado de tus nuevas carillas. 🤩
> 
> Te queríamos pedir un favor enorme. Para nosotros es súper valioso si nos dejás una reseña en Google. Como mucha gente nos busca con dudas, nos ayuda muchísimo si en tu comentario contás brevemente **qué tratamiento te hiciste (ej. carillas de porcelana)** y **cómo fue tu experiencia atendiéndote en Puerto Madero con el Dr. Ariel Merino**. 
> 
> Te dejo el link acá abajo. ¡Gracias de corazón por confiar en nosotros! 
> [LINK A GOOGLE MAPS]"

#### Plantilla 2: Paciente Internacional / Turismo Dental
**Condición sugerida:** Mostrar para pacientes etiquetados como del interior o exterior.
> "Hola [Nombre], fue un placer recibirte en Buenos Aires. ¡Esperamos que hayas tenido un excelente viaje de vuelta! ✈️
> 
> Te quería pedir un favor. A muchos pacientes del exterior les da miedo viajar por temas dentales. Nos ayudaría un montón si nos dejás una reseña en Google contando **desde dónde viajaste**, **que te hiciste carillas de porcelana con el Dr. Ariel Merino**, y qué te pareció la relación calidad/precio comparado con tu país. ¡Tu experiencia le da muchísima confianza a otros!
> 
> Podés dejar tu reseña acá:
> [LINK A GOOGLE MAPS]
> 
> ¡Un abrazo grande desde Argentina!"

#### Plantilla 3: Paciente con Financiación
**Condición sugerida:** Mostrar para pacientes que hayan utilizado planes de pago o financiación.
> "Hola [Nombre]! Qué bueno haber terminado tu diseño de sonrisa. 😁
> 
> Te queríamos pedir un favorcito. Para nosotros tu opinión vale oro. Si tenés un minuto para dejarnos una estrellita en Google, nos ayudaría un montón si mencionás **que te hiciste las carillas con el Dr. Ariel Merino** y, si te sentís cómodo, contar **qué te pareció el plan de financiación**. A veces la gente piensa que es imposible acceder a esto, y leer experiencias reales ayuda mucho.
> 
> Te dejamos el link acá:
> [LINK A GOOGLE MAPS]"

### 3. Tareas Técnicas Esperadas
1. **Interfaz de Usuario:** Agregar un botón "Solicitar Reseña AEO" en la ficha del paciente.
2. **Lógica de Selección:** Mostrar un modal que permita a la recepcionista elegir entre estas 3 opciones (Local, Turismo Dental, Financiación) según el perfil del paciente.
3. **Acción de WhatsApp:** Al seleccionar la plantilla, generar la URL `https://api.whatsapp.com/send?phone=...&text=...` (correctamente encodeada con `encodeURIComponent`) y abrirla en una nueva pestaña para que recepción la envíe al paciente con un clic.
