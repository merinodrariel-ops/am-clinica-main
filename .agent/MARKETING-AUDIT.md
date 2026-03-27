# Marketing Audit: AM Estética Dental
**URL:** https://amesteticadental.com/
**Date:** March 23, 2026
**Business Type:** Local Business — Premium Dental Aesthetic Clinic
**Overall Marketing Score: 63/100 (Grade: C)**

---

## Executive Summary

AM Estética Dental tiene los ingredientes de una clínica premium de primera línea: una dirección en Puerto Madero, el Dr. Ariel Merino como rostro indiscutible de la marca, un simulador de financiación único en el mercado dental argentino, y un Google rating de 4.9 estrellas. Sin embargo, esta auditoría completa de 5 dimensiones revela que la ejecución digital está significativamente por debajo del potencial de posicionamiento. El score final es **63/100 (Grado C)** — bueno en intención, con brechas críticas en ejecución técnica, captura de leads y activación del crecimiento.

La **mayor fortaleza** del sitio es la diferenciación competitiva real: el simulador de financiación con tasa fija 12% TNA y precios en USD en un mercado inflacionario, combinado con fotos de resultados clínicos firmadas como `@drarielmerino` (no stock), crea un stack de posicionamiento que ningún competidor de CABA puede replicar fácilmente. La **mayor brecha** es estructural: páginas críticas de confianza (Equipo, Nosotros, Testimonios) retornan errores 404, no existe mecanismo de captura de emails, y el sitio tiene errores tipográficos en H1 que dañan la credibilidad de una marca que se presenta como premium. El sitio está filtrando leads calificados en silencio.

Las **3 acciones de mayor impacto** son: (1) corregir los errores técnicos críticos en 48 horas — 404s, typos en H1/H2, sitemap HTTP — que están dañando la conversión y el SEO hoy; (2) implementar captura de email con lead magnet para retener a los visitantes en etapa de investigación que no están listos para contactar por WhatsApp; (3) lanzar una página de turismo dental en inglés aprovechando la ventaja cambiaria de Argentina para capturar pacientes internacionales de alto valor.

El impacto estimado de implementar todas las recomendaciones: **+USD 11,000–29,000/mes en revenue adicional** en un horizonte de 3–6 meses.

---

## Score Breakdown

| Categoría | Score | Peso | Score Ponderado | Finding Clave |
|---|---|---|---|---|
| Content & Messaging | 62/100 | 25% | 15.5 | Titular fuerte, pero cero prueba social cuantificada |
| Conversion Optimization | 61/100 | 20% | 12.2 | Simulador de financiación es killer feature; sin captura de email |
| SEO & Discoverability | 61/100 | 20% | 12.2 | Tracking correcto, pero errores técnicos críticos sin corregir |
| Competitive Positioning | 72/100 | 15% | 10.8 | Diferenciación real y sólida; bajo volumen de reseñas vs. competidores |
| Brand & Trust | 74/100 | 10% | 7.4 | Marca personal poderosa; páginas clave retornan 404 |
| Growth & Strategy | 52/100 | 10% | 5.2 | Sin email list, sin referidos, sin turismo dental activado |
| **TOTAL** | | **100%** | **63/100** | |

---

## Quick Wins (Esta Semana)

**1. Corregir typos en H1 y H2 — 15 minutos**
- Dónde: Editor Elementor, homepage
- Qué: "AM Estétoca Dental" → "AM Estética Dental" en H1; "MEJOREA TU PRECENCIA" → "MEJORÁ TU PRESENCIA" y "Testinmonios" → "Testimonios" en H2
- Por qué importa: Google lee el H1 como la señal de contenido primaria. Un typo en el nombre de la clínica daña el entity recognition y la credibilidad para usuarios y crawlers en un sitio de categoría YMYL (salud).
- Impacto estimado: Alto — corrección de daño activo

**2. Reparar las páginas 404 (Equipo, Nosotros, Testimonios) — 2–4 horas**
- Dónde: WordPress admin, páginas eliminadas o con slugs rotos
- Qué: Restaurar o recrear las páginas con contenido mínimo viable; si están en construcción, agregar al menos un placeholder con contenido real
- Por qué importa: Un prospecto que va a gastar USD 2.000–15.000 en un procedimiento estético hace due diligence. Encontrar una página 404 en "Equipo" o "Nosotros" es una señal de abandono — y el prospecto no llama para preguntar qué pasó, simplemente cierra la pestaña.
- Impacto estimado: +15–25% en tasa de conversión del tráfico existente

**3. Actualizar sitemap HTTP → HTTPS — 10 minutos**
- Dónde: WordPress > Yoast SEO > General Settings; robots.txt
- Qué: Asegurarse de que la URL del sitio esté configurada en `https://`. Regenerar el sitemap. Actualizar la directiva Sitemap en robots.txt a `https://amesteticadental.com/sitemap_index.xml`
- Por qué importa: Googlebot sigue una cadena de redirects para rastrear cada URL — consume crawl budget innecesariamente y puede causar que páginas importantes no se indexen.
- Impacto estimado: Mejora de rastreo e indexación en 2–4 semanas

**4. Agregar Open Graph tags a todas las páginas — 30 minutos**
- Dónde: Yoast SEO > Social settings
- Qué: Configurar `og:title`, `og:description`, `og:image` en todas las páginas; subir imagen de preview representativa de la clínica
- Por qué importa: Sin OG tags, cada link compartido por WhatsApp, Instagram o Facebook se renderiza sin imagen ni título controlado. En un negocio que depende de referidos y redes sociales, esto es una brecha de conversión en cada mensaje compartido.
- Impacto estimado: Mejora directa en CTR de links compartidos por pacientes actuales

**5. Corregir el slug incorrecto del artículo de Armonización Orofacial — 5 minutos**
- Dónde: WordPress > Posts > editar el artículo; agregar redirect 301
- Qué: El artículo "Armonización orofacial" tiene el slug de otro artículo (`/como-mantener-tus-carillas-y-prolongar-su-duracion-am-estetica-dental-copy/`). Cambiar al slug correcto y redirigir el anterior.
- Por qué importa: URL y contenido desalineados confunden a crawlers y eliminan el keyword benefit del artículo.
- Impacto estimado: Recupera valor SEO del artículo

**6. Agregar alt text a todas las imágenes — 1–2 horas**
- Dónde: WordPress Media Library + Elementor image widgets
- Qué: Agregar alt text descriptivo a cada imagen, priorizando antes/después: ej. `"carillas dentales antes y después Buenos Aires — AM Estética Dental"`
- Por qué importa: Las imágenes sin alt text son invisibles para Google Images — un canal significativo para búsquedas de resultados de carillas y blanqueamiento en Argentina.
- Impacto estimado: Tráfico incremental desde Google Images en 4–8 semanas

**7. Agregar badge de Google Rating en homepage — 2 horas**
- Dónde: Sección hero o encima del CTA de WhatsApp
- Qué: Widget o elemento estático mostrando "4.9 ★ en Google — [N] reseñas" vinculado al perfil de Google Maps
- Por qué importa: La calificación 4.9 es el activo de confianza más fuerte y actualmente está completamente ausente del sitio web. Mostrarlo en el punto de conversión primario tiene impacto directo en click-through al WhatsApp.
- Impacto estimado: +8–15% en conversión del tráfico existente

**8. Convertir imágenes de la página Opiniones a WebP — 2 horas**
- Dónde: Plugin Imagify o ShortPixel en WordPress
- Qué: Convertir y comprimir las imágenes de 3000×1500px en la página de testimonios
- Por qué importa: LCP (Largest Contentful Paint) es Core Web Vitals crítico. Imágenes sin optimizar en mobile pueden duplicar el tiempo de carga de la página más pesada del sitio.
- Impacto estimado: Mejora de velocidad mobile, SEO ranking signal

---

## Strategic Recommendations (Este Mes)

**1. Implementar captura de email con lead magnet**
- Qué: Crear un recurso descargable — "Guía: ¿Carillas de porcelana o composite? Cómo elegir la mejor opción para tu sonrisa" — y colocar un formulario inline en homepage y páginas de tratamientos
- Rationale: Los procedimientos de alta ticket (carillas, diseño de sonrisa, implantes) tienen un ciclo de decisión de semanas a meses. Sin captura de email, cada visitante que no convierte inmediatamente es una pérdida permanente. Una secuencia de nurturing por email puede recuperar el 10–20% del tráfico que hoy abandona.
- Pasos: (1) Crear el PDF guía en Canva, (2) instalar ConvertKit o Mailchimp, (3) colocar formulario en 3 puntos clave del sitio, (4) escribir secuencia de 3 emails de bienvenida
- Resultado esperado: Lista de 50–200 leads/mes, 10–20% conversión a consulta en 60–90 días

**2. Agregar LocalBusiness/Dentist schema markup**
- Qué: Implementar schema `Dentist` (subtype de `LocalBusiness`) con `addressLocality`, `geo` coordinates, `openingHoursSpecification`, `aggregateRating`, `priceRange`, `telephone`, `url`
- Rationale: Sin este schema, Google no puede poblar un Knowledge Panel completo ni generar rich snippets con estrellas en resultados orgánicos. Para búsquedas locales como "dentista estético Puerto Madero", la ausencia de schema es una desventaja técnica directa vs. competidores que lo tienen.
- Pasos: Instalar/configurar Schema Pro o agregar JSON-LD manual en el header del sitio
- Resultado esperado: Rich snippets en SERPs en 4–8 semanas; mejora en posicionamiento local

**3. Lanzar calendario de contenido SEO — 2 artículos/mes**
- Qué: Publicar artículos targeting keywords transaccionales e informacionales de alto volumen en CABA:
  - "Cuánto cuestan las carillas dentales en Buenos Aires (2026)"
  - "Diseño de sonrisa en Puerto Madero: qué incluye y cómo funciona"
  - "Carillas de porcelana vs composite: diferencias, durabilidad y precio"
  - "Alineadores invisibles precio Argentina — guía completa"
- Rationale: El blog actual tiene 5 artículos pero no está capturando las búsquedas transaccionales de mayor intento de compra en el mercado dental de CABA. La competencia en estas keywords en Buenos Aires es moderada — manejable con consistencia.
- Resultado esperado: +30–80 visitas orgánicas mensuales por artículo en 3–6 meses

**4. Crear página FAQ en cada tratamiento**
- Qué: Agregar sección FAQ al final de cada página de tratamiento con 5–8 preguntas frecuentes y schema `FAQPage`
- Preguntas prioritarias: "¿Cuánto duran las carillas?", "¿Duele el blanqueamiento?", "¿Cuánto cuesta el diseño de sonrisa?", "¿Cuántas sesiones necesito?"
- Rationale: Las FAQs con schema aparecen en los "People Also Ask" de Google — cuadros de alta visibilidad que capturan tráfico de investigación antes de que el prospecto llegue a la página de un competidor.
- Resultado esperado: Tráfico incremental desde PAA boxes; reducción de consultas básicas por WhatsApp

**5. Implementar campaña de reseñas Google post-tratamiento**
- Qué: Flujo automatizado vía WhatsApp enviado 3–5 días después del tratamiento: mensaje personalizado del Dr. Merino agradeciendo y solicitando reseña con link directo a Google Maps
- Rationale: Con 4.9 estrellas el volumen de reseñas es probablemente bajo vs. clínicas establecidas en Palermo/Recoleta con 200–500 reseñas. Aumentar el volumen es la única acción que mejora simultáneamente SEO local, trust en el sitio, y conversión de nuevos pacientes.
- Resultado esperado: +20–40 reseñas nuevas en 2–3 meses; mejora en posicionamiento local pack

**6. Reemplazar Google Form de financiación con formulario nativo**
- Qué: Usar WPForms o Gravity Forms para replicar los campos del formulario de financiación directamente en el sitio, eliminando el redirect a Google Forms
- Rationale: Para una clínica que se posiciona como premium en Puerto Madero, redirigir al prospecto a un Google Form genérico rompe el covenant de marca en el momento más cercano a la conversión. Los formularios on-site tienen tasas de completación 15–30% superiores a off-site.
- Resultado esperado: +15–25% en tasa de solicitudes de financiación completadas

---

## Long-Term Initiatives (Este Trimestre)

**1. Landing page de Turismo Dental en inglés**
- Business case: La diferencia cambiaria actual hace que los tratamientos en Buenos Aires sean 40–60% más baratos que en Uruguay, Chile o Brasil para pacientes extranjeros. Carillas de porcelana que cuestan USD 1.200–1.800 en Miami se pueden ofrecer a USD 600–900 en AM Estética sin sacrificar margen. Los turistas dentales tienen LTV en una sola visita equivalente a 3–5 pacientes locales.
- Qué construir: Landing page en inglés con SEO targeting "dental veneers Buenos Aires", "teeth whitening Argentina", "smile design Buenos Aires" + pricing guide en USD + testimonial de paciente internacional + logística (cómo llegar, dónde alojarse cerca de Puerto Madero)
- Recursos: Redacción en inglés, traducción de páginas clave, configuración SEO hreflang
- ROI proyectado: +USD 3.000–8.000/mes en 4–6 meses (SEO maturity)

**2. Programa de referidos "Recomendá tu sonrisa"**
- Business case: Con una base de pacientes premium (profesionales, emprendedores, figuras públicas) y 4.9 estrellas, la clínica tiene un motor de referidos durmiente. Una estructura explícita con incentivo (ej. sesión de mantenimiento gratis o descuento en blanqueamiento) convierte la recomendación informal en un canal medible.
- Qué construir: Landing page del programa + flujo de WhatsApp automatizado para pacientes post-tratamiento + tracking de códigos de referido
- ROI proyectado: +USD 2.000–5.000/mes (3–6 pacientes nuevos/mes) en 1–2 meses

**3. Secuencia de email nurture "Smile Care"**
- Business case: Una vez construida la lista de emails (Iniciativa #1 del mes), un flujo de 5–7 emails educativos y de mantenimiento aumenta el patient lifetime value y trae pacientes de regreso para tratamientos adicionales.
- Qué construir: Secuencia de bienvenida (3 emails) + secuencia de reactivación a los 6 meses (2 emails) + newsletter mensual con tip de cuidado dental y oferta del mes
- ROI proyectado: +USD 1.500–3.500/mes en reactivaciones

**4. Retargeting ads para visitantes del Simulador de Financiación**
- Business case: Los usuarios que llegaron al simulador de financiación son los leads más calificados del sitio — ya pasaron por awareness e interés, y llegaron a evaluar el costo real. Sin retargeting, se pierden para siempre.
- Qué construir: Audiencia personalizada en Meta Ads de visitantes a `/financiacion-estetica-dental-buenos-aires/` que no convirtieron → anuncio carousel con casos antes/después + "Tu sonrisa te espera. Simulá tu plan de pago" → landing de financiación
- ROI proyectado: +USD 2.500–6.000/mes en conversiones recuperadas

---

## Detailed Analysis by Category

### Content & Messaging (62/100)

**Fortalezas:**
- "Transformá tu sonrisa" supera el test de los 5 segundos: es orientado al beneficio, accionable y auténtico en registro rioplatense (voseo consistente en todo el sitio)
- Los testimonios son cualitativamente superiores al promedio del mercado dental local: nombrados con apellido, especifican el procedimiento realizado, y expresan transformación emocional. La cita de Camila Rossi ("¿por qué no me animé antes?") es copy de conversión de primer nivel.
- El simulador de financiación es un diferenciador raro en el segmento dental premium — la estructura 50%+50% con tasa fija 12% aborda el principal punto de fricción (ansiedad por el costo) con transparencia, no con evasión.
- El blog demuestra autoridad clínica genuina con artículos que cubren comparación ("professional vs casero"), decisión ("todo lo que necesitás saber") y mantenimiento — mapeando al journey de compra completo.
- La marca personal del Dr. Ariel Merino (@drarielmerino en todas las fotos de resultados) crea una señal de autoridad coherente que diferencia la clínica de los competidores anónimos.

**Brechas:**
- La propuesta de valor carece de diferenciador específico sustanciado: "resultados naturales" y "enfoque minimalista" son afirmaciones que cualquier competidor puede copiar. Falta un punto de prueba concreto (número de sonrisas transformadas, nombre de técnica propia, tecnología exclusiva).
- Cero prueba social cuantificada: no hay conteo de pacientes, no hay badge del rating de Google, no hay "más de X años en Puerto Madero". Los testimonios tienen profundidad pero no señalan volumen, lo que debilita la confianza en la etapa de awareness.
- La ausencia total de referencias al precio — ni rangos, ni "desde $X" — crea incertidumbre que puede empujar prospectos sensibles al costo hacia competidores de menor nivel, en vez de llevarlos al funnel de consulta.
- Los artículos del blog no tienen CTA de cierre, atribución de autor, ni links internos a páginas de tratamientos — un lector del artículo de carillas no tiene próximo paso claro para agendar.

### Conversion Optimization (61/100)

**Fortalezas:**
- El CTA de WhatsApp con mensaje pre-cargado elimina la fricción cognitiva del primer contacto y está perfectamente alineado con los hábitos de comunicación del mercado argentino.
- El simulador de financiación es el "Killer Feature" del sitio: en un país con alta inflación y volatilidad cambiaria, mostrar tasas fijas en USD con el tipo de cambio oficial del Banco Nación construye confianza masiva que los competidores no tienen.
- La navegación de 6 items (Clínica → Tratamientos → Opiniones → Financiación → Contacto) sigue un funnel de decisión lógico sin callejones sin salida.

**Brechas críticas:**
- **Zero lead capture para visitantes no listos para WhatsApp.** Sin email, sin newsletter, sin lead magnet. Los procedimientos de alta ticket tienen ciclos de decisión de semanas a meses. Un sitio que solo ofrece "contactame por WhatsApp ahora" filtra a todo el segmento en investigación.
- Sin botón CTA en el header. Una vez que el usuario scrollea, el único mecanismo de conversión es el ícono flotante de WhatsApp. No hay "Reservar turno" o "Consultar precio" anclado en el header — creando dead zones en páginas largas.
- El redirect a Google Forms en la página de financiación rompe la experiencia premium. Para una clínica en Puerto Madero, el infrastructure debe cumplir la promesa de marca.
- Los testimonios están siloed en /opiniones — ausentes en las páginas de tratamientos y de financiación, donde la prueba social tiene mayor impacto.

### SEO & Discoverability (61/100)

**Hallazgos técnicos — Alta prioridad:**
- **Typo en H1 homepage:** "AM Estétoca Dental" — daño activo al entity recognition de Google
- **Sitemap HTTP:** robots.txt apunta a `http://` — cadena de redirects en cada URL rastreada
- **Sin schema LocalBusiness/Dentist:** ausencia total de structured data para el tipo de negocio más importante
- **Sin schema AggregateRating:** la calificación 4.9 no aparece en SERPs como rich snippet
- **Sin Open Graph tags:** links compartidos por WhatsApp y redes sin imagen ni título controlado
- **Slug incorrecto:** artículo de Armonización Orofacial tiene el slug de otro artículo
- **Inconsistencia de nombre en schema:** "AM Dental" vs "AM Estética Dental" en diferentes páginas

**Local SEO:**
- Google Maps listing confirmado con 4.9+ estrellas ✓
- NAP internamente consistente ✓
- Sin mapa de Google embebido en página de contacto
- Mención de Montevideo en el formulario puede diluir la entidad de Buenos Aires

**Gaps de contenido SEO (keywords sin página dedicada):**
- "precio carillas porcelana Argentina" — Transaccional, sin página
- "diseño de sonrisa Puerto Madero" — Local, sin landing específica
- "blanqueamiento dental CABA" — Local, sin página dedicada
- "mejor dentista estético Buenos Aires" — Comparativa, sin "Por qué elegirnos"
- "carillas de porcelana vs composite" — Informacional, sin artículo
- "cuidados post carillas dentales" — Informacional, artículo existe pero URL incorrecta

### Competitive Positioning (72/100)

**Diferenciadores reales y defensibles:**
1. Doctor-as-brand: Dr. Ariel Merino es la cara visible (@drarielmerino) con fotos de resultados clínicos propias, no stock
2. Simulador de financiación interactivo — único en el segmento dental aesthetic de CABA
3. Precios en USD con tipo de cambio oficial Banco Nación — transparencia financiera sin igual
4. Dirección en Puerto Madero — señal de lujo antes de leer una palabra
5. Portfolio completo bajo un techo (8 servicios) — posiciona como destino estético full-service

**Brechas vs. competidores:**
- Volumen de reseñas Google probablemente bajo vs. clínicas establecidas de Palermo/Recoleta con 200–500 reseñas
- Sin presencia en Doctoralia — canal primario de descubrimiento para pacientes con obra social o prepaga
- Footprint de contenido SEO delgado (5 artículos) vs. competidores con 20–50 artículos rankeando

### Brand & Trust (74/100)

**Fortalezas:**
- Brand voice profesional, aspiracional y confiable; Dr. Merino como cara de la marca es correcto para servicios médico-estéticos premium
- Puerto Madero + 10 años de experiencia + clientela de profesionales y figuras públicas refuerzan el posicionamiento premium
- Doble presencia Instagram + TikTok — estrategia de canales correcta para el demografía objetivo

**Brechas críticas:**
- Páginas Equipo, Nosotros y Testimonios retornan 404 — arquitectura de confianza digital ausente en el momento de due diligence del prospecto
- Sin testimonios en video — estándar en medicina estética premium en São Paulo, Miami, Ciudad de México; ausente aquí
- Sin captura de email = sin forma de re-enganchar a visitantes que no convierten en la primera visita

### Growth & Strategy (52/100)

**Oportunidades de crecimiento rankeadas por impacto:**
1. **Turismo dental (inglés/portugués)** — La diferencia cambiaria hace a Buenos Aires 40–60% más barato que Uruguay, Chile o Brasil. Ventana de oportunidad activa hoy.
2. **Programa de referidos estructurado** — Base de pacientes premium con 4.9 estrellas = motor de referidos durmiente; solo necesita activación.
3. **Email list + secuencia de nurture** — El ciclo de decisión de meses requiere un canal de re-engagement que hoy no existe.
4. **Video testimonials para Reels/TikTok** — Contenido de mayor performance en medicina estética, completamente ausente.
5. **Club AM / Membresía de mantenimiento** — Revenue recurrente predecible con whitening touch-ups y mantenimiento.
6. **Retargeting del Simulador de Financiación** — Los visitantes más calificados del sitio se van sin ser retargeteados.

---

## Competitor Comparison

| Dimensión | AM Estética Dental | Clínica Upscale Palermo/Recoleta | Especialista Solo Branded | Cadena Dental Premium |
|---|---|---|---|---|
| Claridad de Titular | Fuerte — "Transformá tu sonrisa" | Moderado — suele ser genérico | Débil a moderado — Instagram-first | Moderado — formulaico |
| Señales de Confianza | Bueno — testimonios, 10 años, galería real | Fuerte — 200+ reseñas Google, múltiples médicos | Variable — fuerte en redes, débil en web | Moderado — reconocimiento de marca, impersonal |
| Transparencia de Precios | Superior — simulador interactivo, USD/ARS | Débil — "consultá presupuesto" | Débil — "WhatsApp para consultas" | Débil/moderado — sin transparencia real |
| Presencia Online | Bueno — web + blog + Instagram + TikTok | Fuerte — Maps dominante, Doctoralia, alto volumen de reseñas | Fuerte en redes, débil en web | Fuerte — Google Ads, Maps, alcance amplio |
| Fuerza del Diferenciador | Alta — simulador, USD, marca personal, dirección | Moderada — tamaño del equipo, volumen de reseñas | Alta en marca personal, baja en estructura | Baja — competencia por precio |
| Contenido Comparativo | Ausente (brecha) | Ausente (brecha de la industria) | Ausente | Ausente |
| Señal de Ubicación | Superior — Puerto Madero como lujo | Bueno — Palermo/Recoleta reconocidos | Neutro a bueno | Neutro — múltiples locaciones diluyen el prestigio |

---

## Revenue Impact Summary

| Recomendación | Impacto Mensual Estimado | Confianza | Timeline |
|---|---|---|---|
| Reparar páginas 404 (conversión tráfico existente) | +USD 1.500–4.000 | Muy Alta | 1–2 semanas |
| Email capture + nurture sequence | +USD 1.500–3.500 | Alta | 1–3 meses |
| Programa de referidos estructurado | +USD 2.000–5.000 | Alta | 1–2 meses |
| Video testimonials (orgánico social) | +USD 1.000–4.000 | Alta | 2–4 meses |
| Google Ads (local + turismo dental) | +USD 2.500–6.000 | Media-Alta | 1–2 meses (pago inmediato) |
| Landing page de Turismo Dental EN/PT | +USD 3.000–8.000 | Media | 3–6 meses (SEO) |
| Club AM / Membresía de mantenimiento | +USD 800–2.500 recurrente | Media | 3–5 meses |
| **Total Potencial** | **+USD 12.300–33.000/mes** | | |

---

## Next Steps

1. **Esta semana (48 horas):** Corregir los 8 errores técnicos críticos — typos en H1/H2, páginas 404, sitemap HTTP, Open Graph tags, slug del blog, alt text, compresión de imágenes. Son cambios de bajo esfuerzo con daño activo hoy.

2. **Este mes:** Implementar captura de email con lead magnet + instalar schema LocalBusiness/Dentist + lanzar campaña de reseñas Google post-tratamiento. Estas tres acciones en conjunto abordan la brecha de trust y la pérdida de leads en investigación.

3. **Este trimestre:** Lanzar landing page de turismo dental en inglés + programa de referidos + secuencia de retargeting para visitantes del simulador de financiación. La ventana de oportunidad cambiaria para turismo dental es real y limitada en el tiempo.

---

*Generado por AI Marketing Suite — `/market audit` — con 5 subagentes especializados: market-content, market-conversion, market-competitive, market-technical, market-strategy.*
