# Diseno: Recolector publico de postulaciones Team AM

**Fecha:** 2026-06-02
**Estado:** Pendiente de revision del usuario

## Problema

AM recibe postulaciones laborales por un Google Form externo. El flujo sirve para
capturar interesados, pero deja la informacion separada de la app, con menor
control sobre privacidad, revision, seguridad anti-spam y futura conversion a
alta de personal.

## Objetivo

Crear un link publico propio para que cualquier persona interesada en sumarse a
Team AM pueda cargar su postulacion y adjuntar CV. Administracion debe poder
revisar, filtrar, descargar y clasificar postulantes desde la app sin exponer CVs
publicamente.

El acceso principal no debe ser una ruta suelta sin contexto: debe nacer en la
pagina publica de Equipo AM. En `am-paginas-web`, la pagina comercial
`/equipo-am` debe incorporar un CTA visible "Trabaja con nosotros" que lleve al
formulario de postulacion. La ruta de formulario puede vivir en la app de
clinica, pero el usuario la descubre desde la pagina publica del equipo.

## Capacidad

- Postulante: abre un link publico, completa el formulario y adjunta su CV.
- Administracion: ve postulaciones en un panel interno, filtra por area/estado,
  revisa respuestas, abre o descarga el CV con URL firmada y clasifica el caso.
- Resultado: las postulaciones quedan ordenadas en Supabase y preparadas para una
  futura conversion a registro de personal si la persona queda seleccionada.

Separacion clave: este recolector es la primera linea masiva de contacto, no el
alta formal de prestador. `registro-prestador` se usa despues, cuando AM ya
selecciono a la persona o decidio avanzar con su incorporacion. La postulacion
laboral no debe crear registros en `personal`, usuarios de portal, liquidaciones
ni permisos internos.

## Superficies

- `am-paginas-web/amesteticadental/src/app/equipo-am/page.tsx`: CTA publico
  "Trabaja con nosotros".
- `am-paginas-web/amesteticadental/next.config.ts` y
  `am-paginas-web/amesteticadental/src/middleware.ts`: las rutas historicas
  `/trabaja-en-am` y `/unete-al-team-am` no deben redirigir al home; deben
  apuntar al nuevo destino laboral.
- Ruta publica de formulario: preferida `/trabaja-en-am`, tambien accesible
  como `/trabaja-con-nosotros` si se quiere un alias mas literal.
- Panel interno en `am-clinica-main`: `/admin/postulaciones` o una seccion
  dentro de Staff/Personal.
- Server action o API route publica para recibir postulaciones.
- Supabase tabla `job_applications`.
- Supabase Storage bucket privado `job-applications`.

## Integracion web publica

La pagina `/equipo-am` ya comunica quienes integran el equipo. El nuevo CTA debe
estar en una posicion natural y no competir con los CTAs de pacientes:

- Hero: boton secundario "Trabaja con nosotros" junto a "Agendar evaluacion" y
  "Ver perfil del Dr. Merino", o
- Cierre de pagina: bloque compacto antes de `Contacto` con titulo orientado a
  postulantes y boton "Trabaja con nosotros".

Recomendacion: usar ambos con distinta intensidad. En hero, link secundario
discreto. En el cierre, CTA mas claro para postulantes: "Si queres sumarte a
Team AM, dejanos tus datos y CV".

El destino debe ser estable y compartible. Para SEO y memoria de URLs viejas,
conviene conservar `/trabaja-en-am` como slug publico canonico.

## Campos del formulario

- Nombre y apellido
- Area de postulacion
- Otra area, cuando corresponda
- Experiencia previa
- Funciones y responsabilidades segun su criterio
- URL de Instagram
- Email
- Ciudad y barrio
- Como trabaja en equipo
- Interes en seguir aprendiendo
- Metas y aspiraciones a largo plazo
- Que aportaria al equipo
- Por que deberiamos elegirle
- CV adjunto
- Consentimiento de tratamiento de datos para proceso de seleccion

## Areas iniciales

- Odontologo General
- Asistente Dental
- Recepcion - Secretaria
- Administracion & Logistica
- Laboratorio Dental - Fresado - Diseno - Maquillaje
- Inversor & Capital
- Cirugia Implantes
- Ortodoncia
- Especialista en Protesis Fija - Rehabilitacion
- Otros

## Datos

Tabla `job_applications`:

- `id uuid primary key`
- `created_at timestamptz`
- `full_name text`
- `area text`
- `other_area text null`
- `experience text`
- `area_responsibilities text`
- `instagram_url text`
- `email text`
- `location text`
- `teamwork_answer text`
- `learning_interest text`
- `long_term_goals text`
- `team_contribution text`
- `why_choose_you text`
- `cv_storage_path text`
- `cv_original_filename text`
- `cv_mime_type text`
- `cv_size_bytes integer`
- `status text default 'nuevo'`
- `review_notes text null`
- `reviewed_at timestamptz null`
- `reviewed_by uuid null`
- `source text default 'web_public'`
- `ip_hash text null`
- `user_agent_hash text null`

Estados:

- `nuevo`
- `preseleccionado`
- `entrevista`
- `descartado`
- `contratado`

Bucket `job-applications`:

- Privado
- Limite sugerido por archivo: 10 MB
- MIME permitidos: PDF, DOC, DOCX
- Path sugerido: `YYYY/MM/{application_id}/{safe_filename}`

## Seguridad y anti-spam

El endpoint publico no debe insertar directamente desde el cliente con permisos
anonimos amplios. Debe pasar por server action/API route con validacion.

Controles iniciales:

- Honeypot invisible: si viene completo, rechazar.
- Tiempo minimo de completado: rechazar envios demasiado rapidos.
- Rate limit por IP hash y ventana temporal.
- Validacion estricta con Zod en todos los campos.
- Tamano maximo de archivo.
- Lista allowlist de MIME y extension para CV.
- Nombre de archivo saneado; nunca usar path provisto por el usuario.
- Bucket privado; el panel genera URLs firmadas al momento de ver/descargar.
- No loguear contenido de postulaciones, emails completos ni archivos.
- Mensaje publico generico ante errores para no revelar reglas internas.

Controles recomendados de fase 2:

- Turnstile o reCAPTCHA si aparece spam real.
- Escaneo antivirus externo si el volumen o riesgo sube.
- Deteccion de duplicados por email + area + ventana temporal.
- Script programado para limpiar postulaciones descartadas antiguas si AM define
  una politica de retencion.

## Privacidad

Los CVs y respuestas son datos personales. Deben ser accesibles solo desde
superficies internas autenticadas. El formulario debe incluir consentimiento
simple: AM usa los datos enviados exclusivamente para evaluar postulaciones y
contactar al postulante.

## Panel de administracion

Vista tipo tabla/detalle:

- KPIs compactos: nuevos, preseleccionados, entrevista, contratados.
- Filtros: estado, area, busqueda por nombre/email.
- Orden: mas recientes primero.
- Acciones: cambiar estado, agregar nota interna, ver CV, descargar CV.
- Detalle: respuestas completas y datos de archivo.

## No objetivos

- No reemplaza el alta formal de personal.
- No usa `registro-prestador` como formulario publico masivo.
- No crea registros en `personal` al recibir una postulacion.
- No crea usuarios de portal automaticamente.
- No envia contratos ni invitaciones de Supabase Auth.
- No importa automaticamente historicos del Google Form en esta primera etapa.
- No comprime PDFs en el flujo inicial, salvo que los tamanos reales lo exijan.
- No convierte la pagina `/equipo-am` en una landing laboral completa; solo suma
  entrada clara hacia el formulario.

## Verificacion

- Build/lint de archivos tocados.
- Test manual local del formulario con un PDF valido.
- Test de rechazo con archivo invalido o demasiado grande.
- Verificacion de que el CV no tenga URL publica.
- Verificacion de que el panel interno pueda generar URL firmada.
- Verificacion en `am-paginas-web` de que `/equipo-am` muestra el CTA y que
  `/trabaja-en-am` ya no redirige al home.
- Deploy y prueba en produccion si el usuario confirma implementacion.

## Riesgos

- Si el bucket se configura publico por error, se exponen CVs. Mitigacion:
  migracion explicita `public = false` y acceso solo por URL firmada.
- Si el endpoint publico usa service role sin validacion fuerte, se vuelve una
  puerta de spam. Mitigacion: validacion server-side, rate limit y honeypot.
- Si se aceptan archivos arbitrarios, hay riesgo operativo. Mitigacion: allowlist
  de MIME/extension, limite de tamano y no ejecutar/parsear archivos recibidos.

## Decision recomendada

Implementar fase 1 con Supabase tabla + bucket privado + formulario publico +
panel interno basico. Dejar compresion, captcha fuerte e importacion historica
como mejoras posteriores activadas por necesidad real.
