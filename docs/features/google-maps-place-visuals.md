# Feature: Lugares y mapas verificables con Google Maps

**ID:** FEAT-GMAP-001  
**Estado:** Prueba Google disponible y piloto integrado en el mismo draft con cartografía abierta (GMAP-11); cobertura general y exportación de contenido Google pendientes  
**Producto:** Press Craftor · SaaS para marcas de cualquier país  
**Piloto:** salut.st.jean; validación adicional en otras regiones  
**Tablero:** [google-maps-place-visuals.kanban.md](google-maps-place-visuals.kanban.md)  
**Base existente:** [Fidelidad visual de lugares reales](real-place-visual-fidelity.md)

## Problema y resultado esperado

Una slide puede nombrar una plaza, dirección o carretera real y mostrar un paisaje inventado. Una ilustración convincente no acredita que ese sea el lugar. Los vecinos reconocen las diferencias; un mapa con un marcador equivocado también comunica información falsa.

Queremos que cada unidad del carrusel utilice una fotografía del lugar identificado o cartografía basada en datos verificables. Google Maps Platform amplía las opciones de búsqueda y localización; el material que llega al PNG debe permitir su uso concreto. Una URL real, un `place_id`, una respuesta de IA o una clave de pago no bastan por sí solos para autorizar cualquier representación.

El resultado se prepara automáticamente **dentro del mismo draft**, con evidencia por slide y una revisión humana final. No se promete precisión universal del 100 % ni se crea otra publicación a la que el editor deba saltar para continuar.

## Relación con lo implementado

El recorrido actual ya dispone de `preparePlaceVisuals`, snapshots `placeVisual`, búsqueda con Luna, resolución Wikidata, material elegible de Commons y mapas de geometría abierta. MapTiler dejó de ser un requisito. Esta propuesta añade conectores Google y completa la selección, trazabilidad y exportación; no reemplaza esos módulos ni declara terminada su validación mundial.

- Reutilizar [prepare-place-visuals.ts](../../src/app/modules/stories/prepare-place-visuals.ts), [creative-place-visual.ts](../../src/app/modules/stories/creative-place-visual.ts), los proveedores documentales, el renderizador, R2 privado y el versionado de assets.
- Integrar [edición de imágenes](creative-image-editing.md): cambiar texto o material de una unidad recompone esa unidad; conserva las demás y su historial.
- Entregar el paquete aprobado a [publicación de Instagram](instagram-publishing.md), manteniendo noticia, draft, unidades y versión publicada vinculados.
- La primera entrega autorizada implementa GMAP-00: configurar una prueba, consultar Google y componer previews dentro de la aplicación. GMAP-01 a GMAP-10 siguen pendientes; esta entrega no los da por completados.

## Primera entrega para probar la viabilidad

### GMAP-00 — Consultar un lugar, traer mapa y fotos y comparar composiciones

**Como** editor, **quiero** probar un lugar real con Google Maps antes de integrar el conector en mis carruseles, **para** comprobar cobertura, correspondencia visual y calidad del material.

**Prioridad:** P0 · **Estado:** Implementación terminada y API real comprobada; en revisión visual y de cobertura.

**Criterios y tareas**

- [x] Añadir la prueba en **Creative profile → Place fidelity → Google Maps · composition test**, aislada por tema y autenticada.
- [x] Registrar nombre, municipio, región, país e idioma de búsqueda. El ámbito de prueba es editable sin guardar cambios en el perfil.
- [x] Consultar Places Text Search (New) con campos explícitos y hasta cinco resultados; comparar nombre y componentes geográficos. Homónimos, respuestas incompletas, rutas y localidades completas no producen marcadores puntuales automáticos.
- [x] Tolerar diferencias de escritura en el ámbito (mayúsculas, acentos latinos y guiones/espacios) sin equiparar municipios distintos ni inferir identidades. Mostrar por candidato el campo de ámbito que falla y distinguirlo de una discrepancia de nombre.
- [x] Permitir inspeccionar un único establecimiento o punto de interés local devuelto por Google aunque su nombre difiera de la consulta. Etiquetarlo como candidato con identidad no verificada y conservar su nombre de proveedor. Una dirección sin establecimiento, varios candidatos locales o una respuesta incompleta no activan esta alternativa. Esta excepción de preview no se aplica al recorrido documental de producción.
- [x] Obtener Maps Static a partir del candidato único y hasta dos Place Photos, con las atribuciones recibidas. Un error parcial conserva el material que sí se pudo obtener.
- [x] Mostrar composiciones HTML con proporción objetivo 4:5, marca y encabezado fuera de la imagen, original sin recorte ni transformación, y atribución visible. El material sigue siendo candidato para inspección visual, no evidencia del evento.
- [x] Añadir modo demo con placeholders explícitos; no realiza búsquedas ni simula una foto o un mapa real.
- [x] Añadir variables documentadas en `.env.example` y campos ausentes en `.env.local`, sin sobrescribir credenciales existentes.
- [x] Limitar llamadas, concurrencia, bytes y tiempo; comprobar DNS público al conectar, destinos fijos y ausencia de redirecciones. Mantener claves y referencias de descarga fuera de las respuestas públicas.
- [x] Mantener el resultado en memoria con caducidad de 15 minutos y respuestas `no-store`; sin escrituras en R2, snapshots, biblioteca o drafts, ni envío a modelos.
- [x] Probar coincidencia geográfica, resultados ambiguos, errores parciales, atribución, archivos originales, firma opcional y autenticación; comprobar el endpoint demo en localhost.
- [ ] Ejecutar con una clave real y revisar visualmente un lugar de salut.st.jean y otro de una región distinta. Registrar resultados, latencia y consumo en Google Cloud.
- [ ] Decidir a partir de esa prueba y de GMAP-01 qué material puede entrar en la composición persistente y exportación social.

**Cómo probarlo**

1. Habilitar **Places API (New)** y **Maps Static API** en el proyecto Google Cloud con facturación configurada. Es una clave de Maps Platform, no una clave de Gemini. Restringirla a las APIs usadas y al entorno servidor cuando sea viable; las restricciones de HTTP referrer de navegador no corresponden a estas llamadas servidor.
2. Completar `CREATIVE_GOOGLE_MAPS_API_KEY` y establecer `CREATIVE_GOOGLE_MAPS_PREVIEW_ENABLED=true`. `CREATIVE_GOOGLE_MAPS_SIGNING_SECRET` es opcional y distinto de la API key.
3. Reiniciar la app y abrir la prueba desde el perfil. Introducir el lugar, ámbito e idioma (`fr`, `en`, `es`…). Revisar las direcciones devueltas y la correspondencia de las fotos. El idioma también afecta a los nombres devueltos por el proveedor. Si hay un único punto de interés local con otro nombre, se muestra para inspección con `nameMatch=search-candidate`; no se declara identidad verificada.
4. Pulsar **Test Google Maps**. Mientras no haya clave, **Demo layout · no Google search** permite comprobar el recorrido y las composiciones sin consumir Google.

**Límites de esta entrega:** hasta seis solicitudes de red por prueba, 40 segundos para el proveedor, 8 segundos de inactividad por descarga, 5 MB por recurso y dos pruebas simultáneas como máximo, una por tema. `CREATIVE_GOOGLE_MAPS_MAX_PHOTOS` admite 1–2 (predeterminado 2); `CREATIVE_GOOGLE_MAPS_MAX_PREVIEWS_PER_DAY` admite 1–50 (predeterminado 10). El contador es global **por proceso** y día UTC: reinicios o varias instancias modifican el límite efectivo. No sustituye cuotas de Google Cloud ni el presupuesto persistente por marca previsto en GMAP-02.

`GET /api/radar/creative/maps-preview?topicId=…` muestra solo configuración no secreta. `POST` devuelve candidatos, razones y previews temporales. La prueba no acredita la identidad únicamente por la coincidencia del nombre, la fecha de captura ni que una foto muestre una reforma. Tampoco resuelve todavía áreas o tramos viales como los de Québec 511 (GMAP-04).

**Validación:** las 519 pruebas pasan, incluidas diez específicas de este conector; lint y build de producción también pasan (incluye TypeScript). El endpoint local devolvió HTTP 200 en configuración y demo, dos imágenes placeholder 1080×680 para las zonas de imagen y cero solicitudes Google. Posteriormente se ejecutó una búsqueda real con credenciales: véase el caso siguiente. El objetivo de proporción 4:5 corresponde al contenedor completo con texto y atribuciones, no al archivo original de mapa o foto. La composición en navegador queda pendiente de inspección visual con material real; tampoco se ha certificado cobertura mundial.

**Caso real — Fête des récoltes / Saint-Luc (8 de septiembre de 2026):** la búsqueda `Forêt nourricière de Saint-Luc` del usuario devolvió lugares de otros municipios y quedó excluida correctamente. La [fuente municipal](https://sjsr.ca/communiques/fete-des-recoltes-a-la-foret-nourriciere-pour-le-plaisir-de-celebrer-et-partager-les-richesses-de-la-terre/) ubica el evento en el terreno junto a la biblioteca Saint-Luc (347, boulevard Saint-Luc). Una prueba posterior desde localhost con `Bibliothèque Saint-Luc`, municipio Saint-Jean-sur-Richelieu, región Québec, país Canada e idioma `fr` devolvió HTTP 200, un candidato con ámbito coincidente, un mapa 1080×680 y dos fotos candidatas, en seis solicitudes. No se guardaron los originales ni se incorporaron al post. Esto valida conectividad y recuperación de material para **la biblioteca**, no la identidad visual del bosque: sus fotos no son un sustituto automático. El vínculo «junto a» se implementa posteriormente en GMAP-11 mediante datos de OpenStreetMap obtenidos de forma independiente; las fotos de la biblioteca continúan siendo candidatas del preview Google.

Referencias de los adaptadores: [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos), [Maps Static](https://developers.google.com/maps/documentation/maps-static/start) y [atribución de Places](https://developers.google.com/maps/documentation/places/web-service/policies).

**Regresión de ámbito corregida:** `Saint jean sur richelieu / quebec / canada` ya coincide con los componentes `Saint-Jean-sur-Richelieu / Québec / Canada`. Antes se rechazaba por diferencias de guiones y acentos. Si una búsqueda de una escuela devuelve únicamente `618 Rue Garneau`, el resultado explica que el ámbito coincide pero esa dirección no confirma la escuela. Las pruebas cubren esa separación, la consulta explícita de una dirección y el rechazo de municipios distintos o componentes faltantes. No se añadió una asociación entre esa dirección y Vision School.

**Prueba real — consulta `vision school`:** después de habilitar el preview de un único punto de interés local, el endpoint devolvió HTTP 200, `nameMatch=search-candidate`, un mapa 1080×680 y una foto candidata 900×672, en cuatro solicitudes. La composición conserva el nombre que Google devolvió y muestra la identidad como no verificada; no cambia el draft ni aprueba material. Catorce pruebas específicas pasan, incluyendo nombre comercial distinto, múltiples puntos locales, direcciones sin establecimiento y paginación incompleta.

**Corrección visual del demo (9 de septiembre de 2026):** se reprodujo en Chrome que ambos PNG cargaban, pero una tarjeta estrecha reservaba aproximadamente 26 px para una imagen de 125 px; el pie se superponía al gráfico. El área de imagen ya no se contrae y conserva la altura proporcional del original. Si texto y atribuciones requieren más espacio que la proporción objetivo, la tarjeta crece antes que ocultar material. Verificado con el componente y CSS compilados en una fixture local: viewports de 1200 y 390 px, dos imágenes decodificadas, altura reservada igual a la renderizada y sin superposición con el pie. Cero consultas a Google; lint y build pasan. Esta comprobación de layout no sustituye la revisión visual de fotografías reales.

## Decisiones de producto

1. **Identidad antes de representación.** Vincular cada mención con sus hechos citados y resolver país, localidad y lugar concreto. Un nombre comercial, una dirección, un área y un tramo vial requieren evidencia distinta.
2. **Preparación sin preguntas intermedias.** La configuración de marca y proveedores es previa. Durante una ejecución, la falta de datos termina en una alternativa explicada, nunca en una espera de confirmación del lugar.
3. **Fotografía y mapa cumplen funciones distintas.** La foto muestra una apariencia documentada; el mapa muestra ubicación. Ninguno demuestra automáticamente una obra, cierre o cambio anunciado.
4. **La IA prepara consultas y texto; no inventa coordenadas, calles ni permisos.** El servidor consulta proveedores reales y valida sus respuestas. El envío de contenido de un proveedor a modelos depende de la capacidad de uso habilitada.
5. **La incertidumbre determina la salida.** Foto elegible; mapa pertinente y exportable; composición conceptual sin lugar reconocible cuando la política lo permita, o tipografía. Si faltan hechos suficientes, resultado bloqueado en la revisión final.
6. **Revisar la pieza completa.** Elegibilidad automática, preparación y aprobación humana son estados diferentes. Aprobar texto no aprueba por sí solo fotografías, mapas ni una versión posterior.

## Qué puede aportar Google y qué debe verificarse

Consulta documental: **8 de septiembre de 2026**. La habilitación debe considerar el servicio concreto, la región de facturación y el contrato aplicable; la tabla siguiente define decisiones de diseño, no una licencia general de exportación.

| Capacidad | Uso propuesto | Condición de entrega |
|---|---|---|
| Places API (New): Text Search y Place Details | Encontrar candidatos, distinguir homónimos y enlazar el lugar | Pedir campos mínimos y comprobar identidad; guardar únicamente contenido permitido |
| Geocoding API | Resolver direcciones cuando Places no basta | Conservar la granularidad; un centroide o coincidencia parcial no se convierte en un punto exacto |
| Maps Static API | Obtener cartografía renderizada por el proveedor | Validar composición, almacenamiento y exportación social de nuestro flujo antes de habilitarlos |
| Place Photos (New) | Examinar fotografías asociadas al lugar | Distinguir acceso en la aplicación de reutilización en el carrusel; atribución y derechos compatibles |
| Street View | Posible consulta futura en una superficie admitida | Fuera de la exportación y de las referencias image-to-image del MVP |
| Maps Grounding Lite | Posible integración futura de datos Google con un LLM | Evaluar sus términos específicos; no trasladar sus excepciones a Places ni a generación de imágenes |

Places distingue almacenamiento y visualización, permite conservar `place_id` y exige atribuciones. Los nombres de recursos de Place Photos pueden caducar y no deben cachearse. Por ello, no se diseñará una biblioteca permanente de respuestas o fotos Google por defecto. [Políticas de Places](https://developers.google.com/maps/documentation/places/web-service/policies), [Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos).

Los términos generales restringen crear contenido derivado de Google Maps Content; los términos específicos contienen condiciones y excepciones por servicio. **Vectorizar una captura o pasarla a image-to-image no resuelve ese límite.** Para Places y Geocoding no se asumirá permiso para colocar su contenido sobre un mapa de otro proveedor. El recorrido abierto resolverá sus coordenadas y geometría de manera independiente. [Términos de Maps Platform](https://cloud.google.com/maps-platform/terms), [términos específicos](https://cloud.google.com/maps-platform/terms/maps-service-terms).

Las guías de Google contemplan anotaciones y estilos admitidos, pero requieren conservar atribución y distinguen Maps, Earth y Street View. Prohíben capturar Street View para extraerlo de su contexto. Esta propuesta no habilita scraping ni capturas automatizadas de la web de Google. [Guías de uso geográfico](https://about.google/brand-resource-center/products-and-services/geo-guidelines/).

**Viabilidad de exportación:** GMAP-01 debe documentar si el PNG compuesto, su almacenamiento en R2, su entrega a Meta y su permanencia en redes están cubiertos. Si no lo están, el conector puede servir para las consultas admitidas, pero el PNG utiliza fotografías autorizadas o cartografía abierta con evidencia independiente. No se marcará la exportación Google como completada en ese caso.

## Recorrido automático

1. Congelar noticia, hechos por unidad, ámbito, política y versión del draft.
2. Extraer consultas desde el texto fuente y buscar candidatos con los conectores habilitados. La IA no puede convertir una dirección inventada en evidencia.
3. Resolver la identidad y la geometría adecuada. Comparar resultados contra la noticia y el ámbito; conflictos relevantes impiden usar esa localización.
4. Consultar la biblioteca y fuentes fotográficas autorizadas; evaluar identidad, uso y contexto temporal de forma separada.
5. Elegir fotografía o mapa según el propósito de la slide. Para un cierre vial, validar el tramo afectado con su fuente oficial; no usar una ruta sugerida por navegación como geometría del cierre.
6. Componer a 1080×1350, dejando legibles material, texto editorial, procedencia y atribución. Guardar snapshot y resultado dentro del mismo draft.
7. Presentar todas las slides y su evidencia en la revisión final. Si hay una alternativa, explicar el motivo concreto: lugar ambiguo, foto sin autorización de exportación, tramo sin geometría, cuota agotada, etc.
8. Aprobar el conjunto exacto; exportar o publicar únicamente mientras su aprobación y condiciones sigan vigentes. Corregir y relanzar crea una nueva versión pendiente de revisión.

## Historias y tareas

### GMAP-01 — Definir servicios y usos habilitables

**Como** responsable del SaaS, **quiero** conocer qué operaciones permite cada servicio, **para** diseñar un recorrido que realmente pueda entregar el carrusel.

**Prioridad:** P0 · **Dependencias:** ninguna

**Criterios de aceptación**

- Existe una matriz por proveedor: consultar, mostrar, almacenar, componer, estilizar, enviar a IA, exportar y publicar; cada capacidad tiene fuente, fecha y condiciones.
- Se documenta la decisión de exportación Google y la alternativa operativa. Una capacidad desconocida permanece deshabilitada sin bloquear las demás.
- Se distinguen resultados de API, contenido propio y fuentes abiertas; la atribución por sí sola no sustituye la autorización de uso.

**Tareas**

- [ ] Registrar APIs, versión, contrato/región aplicable y requisitos de aviso de privacidad/términos.
- [ ] Resolver el caso concreto PNG → R2 → descarga/Meta → publicación persistente, incluyendo las fotos de terceros.
- [ ] Definir retención por clase de dato, material publicable y reglas de revocación/caducidad.
- [ ] Registrar la decisión de salida Google y la alternativa abierta; dejar cualquier modalidad no habilitable explícitamente pendiente o excluida.

### GMAP-02 — Configurar acceso y presupuesto por marca

**Como** administrador, **quiero** habilitar los conectores una vez y limitar su consumo, **para** que cada publicación se prepare autónomamente.

**Prioridad:** P0 · **Dependencias:** GMAP-01

**Criterios de aceptación**

- Proveedores deshabilitados por defecto; claves y solicitudes sensibles permanecen en servidor. Una clave presente no activa todas las capacidades.
- Cuotas por tema y cuenta compartida se coordinan entre procesos; una alerta de facturación no se presenta como corte de gasto.
- Falta de configuración o presupuesto agotado produce alternativa automática y motivo visible al final.

**Tareas**

- [ ] Añadir configuración validada de proveedor, capacidades y límites; documentar variables propuestas sin modificar `.env.local`.
- [ ] Aplicar restricciones de clave apropiadas al despliegue del servidor y separar cualquier clave de navegador si hiciera falta.
- [ ] Usar máscaras de campos mínimas; registrar SKU, peticiones, reintentos y coste estimado sin claves ni URLs firmadas.
- [ ] Implementar reserva de presupuesto distribuida y métricas por marca; diferenciar estimación local y facturación del proveedor.

### GMAP-03 — Resolver lugares globales con evidencia

**Como** editor, **quiero** obtener el lugar correcto de cada noticia, **para** evitar homónimos y localizaciones aproximadas presentadas como exactas.

**Prioridad:** P0 · **Dependencias:** GMAP-02; GEO-02/GEO-03 existentes

**Criterios de aceptación**

- El lugar del evento se distingue de menciones secundarias y genéricas; cada candidato corresponde a una consulta real.
- Nombre, ámbito y evidencia de la noticia sustentan la elección. Un sesgo de búsqueda o el primer resultado no confirman identidad.
- Se conserva la precisión disponible: dirección, acceso, edificio, localidad o área. Conflictos o resultados insuficientes impiden el marcador puntual.

**Tareas**

- [ ] Implementar adaptadores Places (New) y Geocoding con respuestas estructuradas validadas.
- [ ] Normalizar nombres locales, aliases, acentos, idiomas y direcciones internacionales sin asumir Canadá.
- [ ] Vincular candidatos a hechos y unidades; explicar selección/exclusión mediante reglas, no solo confianza del modelo.
- [ ] Mantener separación de procedencia; el resolver abierto obtiene sus propios datos para la salida abierta.

### GMAP-04 — Vincular puntos, áreas y tramos con el hecho narrado

**Como** editor, **quiero** que la localización represente el expediente correcto, **para** no situar una obra o demolición en otra dirección.

**Prioridad:** P0 · **Dependencias:** GMAP-03

**Criterios de aceptación**

- Acción, lugar, dirección, periodo y estado del expediente permanecen ligados a la misma evidencia.
- Un cierre entre kilómetros o salidas exige geometría del tramo acreditada; una línea recta entre puntos o una ruta calculada no la reemplazan.
- Un área puede mostrarse como área de contexto; no se simula precisión de parcela, entrada o tramo inexistente.

**Tareas**

- [ ] Definir el contrato de geometría y precisión para punto, área y segmento.
- [ ] Reutilizar adaptadores de fuentes oficiales, incluido 511 cuando esté configurado, sin convertirlos en requisito mundial.
- [ ] Comprobar periodo, dirección vial, coordenadas y vínculo con la noticia; excluir contradicciones.
- [ ] Añadir casos de demolición frente a proyecto de vivienda, carreteras homónimas y avisos caducados.

### GMAP-05 — Preparar mapas reales exportables

**Como** editor, **quiero** una slide de localización legible y verificable, **para** explicar dónde ocurre la noticia.

**Prioridad:** P0 · **Dependencias:** GMAP-01, GMAP-04

**Criterios de aceptación**

- El mapa usa coordenadas/geometría admitidas por su proveedor. Los marcadores y trazados corresponden a GMAP-04.
- Google Static se habilita para composición/exportación solo con la decisión favorable de GMAP-01. La rama abierta no recibe coordenadas copiadas de Google.
- Texto, zoom y encuadre no sugieren navegación, afectación vial ni precisión que la evidencia no permita. Se conserva atribución completa.
- La pieza final 4:5 mantiene mapa legible y proporciones; no estira una respuesta pequeña ni corta logos para llenar el lienzo.

**Tareas**

- [ ] Implementar Maps Static detrás del contrato de proveedor, validando resolución, límites, URLs y contenido de respuesta.
- [ ] Adaptar la composición existente para mapas con rótulo de localización y espacio suficiente para atribución.
- [ ] Integrar la rama abierta existente y sus límites; excluir polos, antimeridiano u otras geometrías no soportadas con motivo explícito hasta disponer de soporte.
- [ ] Verificar una exportación real de punta a punta para cada modalidad declarada habilitada.

### GMAP-06 — Buscar fotografías del lugar y evaluar su uso

**Como** editor, **quiero** que se elija material real automáticamente, **para** mostrar un lugar reconocible sin inventar su apariencia.

**Prioridad:** P0 · **Dependencias:** GMAP-01, GMAP-03

**Criterios de aceptación**

- Consultar primero material propio del tema; después repositorios y fuentes habilitados. Las fotos de Places se tratan según la capacidad aprobada, no como descarga libre.
- Una foto asociada a un lugar puede mostrar un interior, una persona o un evento: la asociación sola no demuestra pertinencia para la slide.
- Fotografía de archivo y fecha desconocida se identifican. Ninguna foto antigua acredita automáticamente el estado de una obra actual.

**Tareas**

- [ ] Implementar el conector Place Photos para los usos permitidos y conservar las atribuciones exigidas mientras se muestra.
- [ ] Unificar el acceso a la biblioteca privada y fuentes compatibles sin descargar material Google no habilitado para ese destino.
- [ ] Registrar por candidata identidad, contexto temporal, permisos y motivo de exclusión; no guardar permanentemente recursos transitorios.
- [ ] Validar originales por contenido, tamaño, dimensiones y destino de red, reutilizando los controles de descarga existentes.

### GMAP-07 — Integrar la preparación en el mismo carrusel

**Como** editor, **quiero** recibir la publicación terminada en mi draft, **para** no quedar atrapado entre generación y preparación documental.

**Prioridad:** P0 · **Dependencias:** GMAP-05, GMAP-06

**Criterios de aceptación**

- El mismo proceso decide foto, mapa o alternativa por unidad y guarda `placeVisual` junto al asset. No abre una publicación documental separada.
- No exige aprobar el guion ni cada imagen durante la preparación: usa estados propios y no rellena `approvedAt` para atravesar controles del recorrido tradicional.
- Cada slide representa solo sus lugares citados; una foto no se reutiliza silenciosamente para varios lugares.
- Cambiar una imagen o texto afecta únicamente las unidades dependientes; si cambia un lugar compartido, se invalidan todas las vinculadas.
- La preparación termina dentro de un presupuesto total, incluidos proveedores alternativos. Un timeout no habilita una reconstrucción generativa del lugar.

**Tareas**

- [ ] Conectar los adaptadores a `preparePlaceVisuals` y a regeneración/edición individual.
- [ ] Añadir deduplicación e idempotencia por versión y unidad; comprobar vigencia antes de persistir resultados asíncronos.
- [ ] Definir límites de candidatos, solicitudes y tiempo total configurables, con pruebas de agotamiento y fallback.
- [ ] Mostrar progreso y resultado sin pedir confirmaciones intermedias ni ofrecer botones que devuelvan al mismo bloqueo.

### GMAP-08 — Revisar y exportar el conjunto exacto

**Como** responsable editorial, **quiero** revisar el material y su evidencia junto al carrusel, **para** aprobar una sola versión completa.

**Prioridad:** P0 · **Dependencias:** GMAP-07

**Criterios de aceptación**

- La revisión muestra por slide la identidad, original/mapa, fuente, precisión, contexto temporal, atribución y motivos de alternativa.
- El servidor exige aprobación vigente del conjunto y derechos de entrega antes de descargar como aprobado o enviar a Meta.
- La aprobación del guion y los assets del conjunto exacto es atómica, condicionada a versión/hash: se aprueba todo o nada. Un resultado asíncrono anterior no puede sustituir esa decisión.
- Cambiar fuente, lugar, política, archivo o texto relevante crea una versión pendiente de revisión; no reutiliza `approvedAt`.
- El histórico conserva decisiones y hashes cuando estén permitidos. El historial no se convierte en una excepción a la retención del proveedor.

**Tareas**

- [ ] Unificar la revisión final del material geográfico con el draft habitual, reutilizando componentes y UXDSL.
- [ ] Guardar un manifiesto de material por unidad con IDs, procedencia independiente, decisiones, vigencia y restricciones de conservación.
- [ ] Aplicar caducidad/eliminación al contenido que no pueda retenerse; conservar la trazabilidad permitida sin respuestas crudas ni secretos.
- [ ] Comprobar versión y aprobación al exportar/publicar; preservar los vínculos con noticia, draft y asset seleccionados.

### GMAP-09 — Estilizar sin inventar la geografía

**Como** editor, **quiero** adaptar material verificable a la marca, **para** conservar reconocimiento local y coherencia visual.

**Prioridad:** P2 · **Dependencias:** GMAP-01, GMAP-08 · **Fuera del MVP**

**Criterios de aceptación**

- Mapas: estilos admitidos por el proveedor o render vectorial de geometría abierta; la IA no redibuja calles, distancias ni marcadores.
- Fotografías: estilización solo con material que permita transformación y envío al modelo. Se identifica como ilustración y no como prueba documental del estado del lugar.
- Reconocibilidad visual requiere contraste con el original en revisión final; el modelo no certifica su propia fidelidad. En modo fotografía obligatoria se conserva la composición documental.

**Tareas**

- [ ] Prototipar paleta y tipografía de marca sobre cartografía vectorial independiente, conservando geometría y atribución.
- [ ] Definir elementos reconocibles que deben preservarse y comparar original/salida para fotografías autorizadas.
- [ ] Excluir capturas Google, Street View y fotos sin capacidad de transformación habilitada de los prompts image-to-image.
- [ ] Evaluar casos reales con vecinos antes de habilitar la opción ilustrada; una ilustración rechazada vuelve a mapa/foto admisible o tipografía.

### GMAP-10 — Validar exactitud, cobertura y operación

**Como** responsable de calidad, **quiero** comprobar el flujo con casos reales y errores controlados, **para** lanzar sin confundir un mapa bonito con uno correcto.

**Prioridad:** P0 · **Dependencias:** GMAP-08; GMAP-09 solo si se incluye la opción posterior

**Criterios de aceptación**

- El piloto incluye una plaza reconocida localmente y un aviso vial con tramo acreditado; otros casos cubren ciudades de al menos tres regiones con distintos idiomas o sistemas de direcciones.
- Se registran aciertos, ambigüedades, falsas identificaciones, proporción foto/mapa/alternativa, tiempo y coste. Las cifras provienen de casos revisados, no de scores de IA.
- Ningún caso negativo conocido produce un marcador exacto falso, una foto de otro lugar o una exportación no habilitada. Los casos reales pasan la revisión editorial final antes de ampliar el piloto.

**Tareas**

- [ ] Crear fixtures de homónimos, plaza sin nombre, dirección parcial, varias ubicaciones, foto incorrecta, permisos ausentes y noticia de cambio de estado.
- [ ] Probar mezcla indebida de procedencias, caducidad, aislamiento por marca, respuestas incompletas, 429, timeout y presupuesto agotado.
- [ ] Probar cambios concurrentes y regeneración individual; verificar atribución y posición del marcador en el PNG con el renderizador real.
- [ ] Ejecutar pruebas relevantes, lint y build; `db:check` solo si se demuestra necesaria una migración.
- [ ] Hacer pruebas limitadas contra proveedores reales, documentar coste y validar visualmente las piezas terminadas antes de habilitar marcas adicionales.

## Orden de entrega y coste

| Etapa | Historias | Resultado comprobable |
|---|---|---|
| Viabilidad y configuración | GMAP-01/02 | Capacidades, coste y destinos que se pueden habilitar |
| Primer mapa real | GMAP-03/04/05 | Lugar y geometría correctos, exportación de una modalidad permitida |
| Carrusel completo | GMAP-06/07/08 | Foto o mapa por slide, mismo draft y revisión final |
| Piloto y lanzamiento | GMAP-10 | Casos reales aprobados, regresiones y métricas |
| Opción de marca | GMAP-09 | Estilización identificada sobre material compatible |

Como referencia de la tarifa global consultada, Static Maps incluye 10.000 eventos mensuales sin cargo y cobra USD 2 por 1.000 en el siguiente tramo; Text Search Pro incluye 5.000 y cobra USD 32 por 1.000 en el siguiente tramo. No son límites por marca ni equivalen a carruseles: campos solicitados, detalles, fotos y reintentos pueden añadir otros SKUs. Revalidar cifras y presupuesto antes de activar. [Precios oficiales](https://developers.google.com/maps/billing-and-pricing/pricing).

Para el piloto, diseñar un techo pequeño configurable y estimar búsquedas + detalles + fotos + render por publicación. No contratar capacidad, activar facturación ni prometer coste cero como parte de esta propuesta. Los servicios públicos de datos abiertos tampoco se tratan como infraestructura ilimitada para todo el SaaS.

## Criterio de cierre

GMAP-01 a GMAP-08 y GMAP-10 completadas con evidencia de ejecución; exportación Google identificada como habilitada o expresamente no disponible, sin esconderlo detrás de un resultado OSM. Al menos una modalidad fotográfica y una cartográfica admitidas deben completar el recorrido real dentro del mismo draft. GMAP-09 puede permanecer pendiente. La revisión final y el vínculo con la publicación nunca se sustituyen por una aprobación del modelo.


## GMAP-11 — Completar el piloto dentro del draft con evidencia de dirección

**Prioridad:** P0 · **Estado:** Implementado; revisión editorial final pendiente.

**Como** editor, **quiero** que una dirección de referencia explícita en la fuente produzca un mapa en su slide y que las demás unidades tengan composiciones conceptuales, **para** terminar el carrusel guardado sin saltar a una publicación diferente.

- [x] Extraer de los hechos citados una relación explícita «à côté de / près de / next to / beside / junto a» con nombre y dirección; conservar el fragmento exacto y los IDs de hechos. No convertir automáticamente la biblioteca en el lugar del evento.
- [x] Resolver país, región, municipio, número y calle mediante Overpass. Exigir un único nodo de dirección y una cadena administrativa no ambigua; rechazar centroides de edificios, respuestas incompletas y homónimos.
- [x] Consultar geometría OSM independiente, conservar sus coordenadas y atribución, y componer un mapa 4:5 con la indicación visible de que el evento se celebra cerca del punto de referencia.
- [x] Asignar el mapa únicamente a una unidad que cite el hecho y nombre el lugar. Conservar texto, orden, draft e historial de imágenes; toda nueva imagen queda pendiente de aprobación.
- [x] Añadir símbolos conceptuales deterministas en las unidades no tipográficas que carezcan de foto/mapa: cosecha, cocina, degustación o información. No dibujar una calle, edificio o paisaje real por aproximación.
- [x] Mostrar nombre, dirección, relación y enlaces de evidencia en la revisión de la imagen. Mover el demo de placeholders a «Layout diagnostics».
- [x] Comprobar el caso real en localhost: la slide 4 obtiene el nodo OSM `1296653926` para 347 boulevard Saint-Luc y cartografía real; el PNG conserva texto y atribución. Las otras slides se recomponen dentro del draft existente.
- [ ] El editor revisa y aprueba las imágenes finales del piloto. No se ha aprobado ni publicado ninguna por esta implementación.

**Decisión de proveedor:** el preview de Google sigue siendo temporal. No se descargan sus fotografías para subirlas al almacenamiento de publicación, ni se utilizan sus coordenadas para dibujar mapas OSM. La composición persistente obtiene datos abiertos directamente. Los [términos de Google Maps Platform](https://cloud.google.com/maps-platform/terms) y los [términos específicos](https://cloud.google.com/maps-platform/terms/maps-service-terms) no deben interpretarse como permiso general para reexportar o mezclar el contenido del preview. GMAP-01/05/06 continúan abiertos para los usos de Google en publicaciones.

**Operación:** reutiliza `CREATIVE_GEO_OVERPASS_URL`, con el endpoint público existente como valor predeterminado, y `CREATIVE_GEO_CONTACT`; no requiere otra clave de pago. La resolución de dirección y la consulta geométrica comparten ocho consultas por proceso y día, caché de 30 minutos con 16 entradas por tipo y deduplicación en curso. Cada petición tiene 18 segundos y 1 MB; la respuesta parcial no es utilizable. El límite por proceso y la disponibilidad del endpoint público requieren una estrategia de capacidad antes de ampliar el SaaS.

**Alcance real:** reconoce algunas construcciones explícitas en francés, inglés y español con dirección entre paréntesis; no es un geocodificador mundial completo. La resolución administrativa requiere nombres locales disponibles en OSM y niveles de región entre 3 y 6. No cubre direcciones sin número, accesos de edificios, límites del evento, todos los alfabetos ni todos los sistemas administrativos. Una falta de coincidencia termina con una composición conceptual o tipográfica y su explicación. La biblioteca de dibujos es limitada y todavía no aplica personajes ni referencias visuales mediante image-to-image.

**Pruebas:** 528 pruebas pasan; 28 pruebas focalizadas cubren la preparación documental y la nueva resolución de direcciones. Cubren la relación de proximidad, ámbitos incompatibles, nodos duplicados, coordenadas de centroides, ausencia de llamadas IA cuando la fuente basta, asignación por slide y conservación de píxeles del mapa. Lint y build de producción pasan. No hay migración. La validación visual local no certifica cobertura mundial.
