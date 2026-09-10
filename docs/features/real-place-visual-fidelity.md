# Feature: Fidelidad visual de lugares reales

**ID:** FEAT-GEO-001  
**Estado:** Recorrido documental implementado — integración de proveedores y validación hiperlocal final pendientes  
**Marca piloto:** salut.st.jean  
**Tablero:** [real-place-visual-fidelity.kanban.json](real-place-visual-fidelity.kanban.json)

**Ampliación propuesta:** [Lugares y mapas verificables con Google Maps — FEAT-GMAP-001](google-maps-place-visuals.md). Añade búsqueda/localización Google y modalidades de material sujetas a sus condiciones, integradas en el mismo draft. Su alcance, tareas y validación están pendientes; no sustituye los proveedores actuales ni habilita exportaciones o referencias generativas de contenido Google por sí sola.

## Actualización — SaaS geográfico genérico (2026-09-08)

El borrador existente puede preparar sus imágenes mediante `preparePlaceVisuals`: investigación con Luna y búsqueda web, resolución independiente en Wikidata con el ámbito del perfil, fotografía de Commons elegible o mapa de datos abiertos. No se infiere el país por la marca ni se limita el núcleo a Québec. El idioma de búsqueda procede del perfil; las evidencias conservan nombres y aliases multilingües. La cobertura depende de los registros disponibles y de la identidad administrativa comprobable: esto no certifica todos los lugares del mundo.

- Generación y recomposición individual guardan `placeVisual` en el snapshot de cada imagen del mismo borrador: representación, lugar, fuente, atribución, hash, fecha, candidatos de búsqueda y motivos. Las demás imágenes y versiones históricas permanecen. La actualización del texto guardado recompone solo la unidad solicitada; no aprueba automáticamente el resultado.
- Se activa la composición local cuando el guion pide cartografía/lugares reconocibles o la política es `photo-required`. Cada unidad usa únicamente sus hechos citados; las unidades tipográficas siguen siendo tipográficas. Para noticias de cambios de estado se excluyen fotos de archivo como prueba; el mapa aporta solo localización. Las imágenes sin evidencia suficiente siguen siendo tipográficas con la explicación en la revisión, sin una falsa localización.
- MapTiler deja de participar en nuevas composiciones. Se consultan geometrías de calles y agua a Overpass y Sharp dibuja el mapa localmente; no se descargan mosaicos de `tile.openstreetmap.org`. Atribución OSM visible en el PNG. No hay clave ni API de mapas de pago obligatoria; IA, almacenamiento e infraestructura mantienen sus costes habituales.
- `CREATIVE_GEO_OVERPASS_URL` permite configurar otra instancia HTTPS pública o propia accesible con DNS público. Vacío usa `https://overpass-api.de/api/interpreter`. Límite conservador: 8 consultas por día UTC **por proceso**, 1 MB por respuesta, 18 segundos por solicitud, caché de 30 minutos y 16 entradas. No es una cuota distribuida ni un servicio con SLA: antes de escalar, provisionar capacidad y coordinación de cuotas.
- El renderizador admite localizaciones puntuales y segmentos verificados en ambos hemisferios. Limita la extensión local a 12 km proyectados, excluye polos/antimeridiano y rechaza respuestas incompletas. Es un mapa de contexto con calles, no un mapa de navegación ni una prueba del estado actual.
- `CREATIVE_GEO_SOURCE_ADAPTERS="quebec511"` habilita el adaptador opcional de la fuente 511/MTMD; vacío lo deshabilita. Su geometría exige coincidencia del aviso, tramo, dirección y fechas. Un fallo del adaptador no convierte el tramo en un marcador del centro municipal. Otros países usan el recorrido general; nuevas fuentes oficiales pueden aportar adaptadores propios.
- La sección de publicaciones documentales independientes queda plegada como acceso al recorrido anterior. No se migran ni se aprueban publicaciones históricas. El recorrido habitual del borrador conserva sus controles de aprobación; esta integración no unifica todavía esos controles con la revisión atómica del recorrido documental independiente.

**Configuración:** ámbito geográfico del perfil, `OPENAI_API_KEY`, `CREATIVE_GEO_MODEL` y `CREATIVE_GEO_CONTACT` siguen siendo necesarios para investigación y resolución. Las URLs encontradas por Luna son candidatas; no autorizan descargar fotos arbitrarias. Actualmente la ingestión automática general usa la foto vinculada en Wikidata y permisos compatibles de Commons; ampliar a fuentes oficiales y biblioteca persistente común sigue pendiente. Los originales del recorrido documental anterior mantienen su almacenamiento privado; el nuevo recorrido conserva metadatos y la composición, pero aún no unifica esa biblioteca.

**Verificación:** 459 pruebas de la suite pasan, más 26 regresiones focalizadas tras el límite temporal final; lint y build Webpack pasan. Se dejan de iniciar consultas nuevas tras 45 segundos de preparación para acotar el trabajo pendiente. Probado un mapa real de París desde Overpass y renderizado local. Pruebas cubren proyección en París, Tokio, Buenos Aires y Ciudad del Cabo, rechazo de geometría inválida, asignación por hechos de cada slide, caducidad, alternativa sin IA y exclusión de fotos ante cambios de estado. Las pruebas de identidad mundial usan dependencias simuladas; queda pendiente validación editorial de publicaciones reales de varias regiones. No se modificó `.env.local` ni se aprobó o publicó ninguna pieza.

Fuentes operativas: [datos OSM y atribución](https://www.openstreetmap.org/copyright), [política de mosaicos públicos](https://operations.osmfoundation.org/policies/tiles/), [uso de instancias Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). Las secciones anteriores de operación con MapTiler, reproducidas más abajo, describen la implementación previa y quedan sustituidas por esta actualización para nuevas composiciones.

## Problema y resultado esperado

Una noticia sobre una plaza concreta puede producir una imagen artificial de una plaza parecida. Para los vecinos, las diferencias en edificios, monumentos, vegetación o distribución hacen evidente el error y perjudican la credibilidad.

El sistema debe identificar el lugar, seleccionar material con evidencia de identidad y condiciones de uso, y preparar una publicación fiel sin intervención humana intermedia. El editor recibe la pieza terminada y su evidencia para una única revisión final. Una fotografía de referencia en un prompt no garantiza fidelidad geométrica ni documental.

## Flujo automático y única revisión humana final

**Decisión de producto:** desde la noticia seleccionada hasta el borrador visual terminado, no se solicitan confirmaciones de lugares, selección de fotografías, aprobación de fuentes ni aprobación de guion. La intervención humana se concentra en una sola revisión al final; ninguna publicación queda aprobada ni se publica automáticamente.

1. Extraer menciones y resolver la identidad usando el ámbito configurado de la marca, registros reutilizables y resultados reales de proveedores. El nombre de la marca no resuelve por sí solo qué Saint-Jean es.
2. Consultar primero la biblioteca privada del tema y después las fuentes externas habilitadas. Filtrar por identidad, condiciones de uso, dimensiones y pertinencia temporal; registrar las evidencias.
3. Componer determinísticamente sobre una fotografía elegible. Si falta y una localización es útil para la noticia, preparar un mapa desde coordenadas verificadas y un proveedor habilitado. Un mapa solo aporta localización, no acredita una reforma ni el estado actual.
4. Si faltan evidencias suficientes, hay ambigüedad o falla un proveedor, terminar una pieza tipográfica con los hechos sustentados. No colocar marcadores aproximados como si fueran exactos ni inventar una plaza. Si tampoco hay hechos suficientes para una pieza segura, entregar un resultado bloqueado con explicación en la misma bandeja final.
5. Entregar pieza, noticia, identidad del lugar, original o mapa, procedencia, condiciones de uso, fecha/contexto y advertencias en una única pantalla. El editor aprueba o rechaza la versión completa; puede corregir y relanzar desde esa revisión. Rechazar o corregir no provoca publicación ni aprobación automática de la siguiente versión.

`Candidato`, `elegible para composición`, `preparado para revisión` y `aprobado por una persona` son estados distintos. La elegibilidad automática autoriza únicamente la preparación dentro de la política configurada; nunca simula una aprobación humana ni rellena `approvedAt`. Las comprobaciones de identidad, uso y actualidad siguen separadas y se presentan juntas al final. La aprobación final registra actor, fecha y los snapshots exactos revisados.

La configuración de ámbito, credenciales, proveedores y fuentes reutilizables es previa a la ejecución. Una configuración incompleta no dispara preguntas durante cada publicación: degrada al resultado tipográfico o bloqueado. Las aportaciones manuales son opcionales, fuera del recorrido automático.

La exigencia de fidelidad se implementa conservando el original y usando cartografía verificable, no prometiendo que una IA pueda certificar una identidad con precisión del 100 %. Una similitud alta no basta. La incertidumbre impide usar esa representación concreta, pero no introduce una aprobación intermedia.

**Reutilización:** conservar una biblioteca por marca y lugar con IDs estables, originales versionados, hashes, evidencias, permisos y contexto temporal. Reutilizar búsquedas y material compatible entre publicaciones; volver a comprobar vigencia y pertinencia para cada noticia. La aceptación anterior de una foto no aprueba nuevas publicaciones ni demuestra el estado actual del lugar.

**Estado real:** Creative Studio incluye una entrada de preparación documental automática para post o carrusel 4:5 y una pantalla de revisión final conjunta. El recorrido conserva copia extractiva de la noticia, consulta Luna con búsqueda web e imágenes para menciones y fuentes candidatas, resuelve identidades elegibles para composición mediante Wikidata y usa originales elegibles de Commons o mapas de MapTiler cuando están configurados. La falta de evidencia termina en tipografía; la falta de texto suficiente o un fallo de composición/almacenamiento termina en un resultado bloqueado. La integración contra servicios reales y la validación visual del piloto siguen pendientes; no se ha certificado precisión geográfica del 100 %.

## Implementación y operación

- Entrada: `CreativeDocumentaryPanel` en Creative Studio; `POST /api/radar/creative/documentary/[storyId]?topicId=…` prepara la pieza desde la noticia seleccionada sin aprobar un brief, guion, fotografía o imagen por separado. `GET` recupera la última ejecución. `PATCH` decide sobre el lote y hash exactos e identifica al revisor al final. La identidad introducida es declarada por el editor; la aplicación conserva su autenticación actual mediante secreto compartido, no añade cuentas individuales.
- El guion utiliza título y hasta tres frases completas del artículo, con límites de longitud. La corrección final admite otro fragmento copiado exactamente del artículo y crea una nueva versión. Este recorrido no invoca al generador de imágenes ni simula `approvedAt`. Los endpoints tradicionales no pueden aprobar por separado un borrador documental.
- Resolución conservadora: nombres literales, evidencia exacta, municipio/región/país y una cadena administrativa no ambigua en Wikidata. Listas de resultados incompletas, homónimos, ubicaciones genéricas o múltiples y coordenadas imprecisas excluyen la representación. Las noticias sobre cambios de estado terminan en tipografía; el sistema no presume disponer de una foto que acredite esos cambios.
- Biblioteca: originales en R2 privado direccionados por hash y tema; procedencia versionada en los snapshots de assets existentes. Se consultan hasta 100 snapshots recientes, se descartan decisiones rechazadas y se vuelve a resolver la identidad. La reutilización de metadatos de foto se limita a 24 horas; después se consulta la fuente otra vez. No hay una tabla ni migración nueva para este recorrido. Los tipos de generación heredados se mantienen en almacenamiento; `provider=documentary` y `providerEndpoint=local/documentary-composition` distinguen la composición determinista.
- Fuente fotográfica habilitada: la imagen vinculada por el registro de lugar en Wikidata, consultada mediante `imageinfo` en Commons. Solo CC0 o CC BY 4.0 con metadatos compatibles, autor, dimensiones mínimas y sin restricciones declaradas. Se conserva la fecha de captura cuando existe; la fecha de descarga nunca la sustituye. No se descargan automáticamente imágenes del artículo sin condiciones de uso. La ingestión de archivos propios y conectores adicionales de fuentes oficiales quedan como ampliación pendiente.
- Descargas: HTTPS y hosts fijos, DNS público comprobado al conectar, sin redirecciones, límites de bytes/tiempo y validación con Sharp. Secretos, URLs con claves y claves de R2 no salen al navegador. Las vistas previas y originales usan endpoints autenticados; descargar como material aprobado vuelve a comprobar la aprobación final y la vigencia.
- Composición: 1080×1350, proporción conservada y márgenes; no hay recorte ni expansión generativa. El original ocupa una zona sin superposición. Atribución, licencia y contexto de archivo/localización se renderizan dentro del PNG; la marca usa el nombre y un color configurado. En carruseles la foto/mapa se asigna solo a la portada; el resto contiene los fragmentos de fuente, evitando reutilizar el lugar silenciosamente en otras unidades.
- Presupuesto: entrada del extractor hasta 18.000 caracteres, máximo dos intentos (solo se reintenta estructura inválida), 35 segundos por intento, hasta tres llamadas de búsqueda web por intento, presupuesto diario creativo existente. Wikidata/Commons comparten hasta 36 consultas y 35 segundos por ejecución; originales hasta 15 MB. Las escrituras y lecturas R2 de preparación reciben un límite total de 100 segundos. La ruta declara 120 segundos; debe desplegarse con una duración compatible. Ejecuciones idénticas se deduplican dentro del proceso y se reutiliza el resultado persistido; no se ha añadido una cola distribuida.
- Concurrencia: snapshot de noticia, ámbito y perfil; comprobación de vigencia al terminar, revisar y exportar. Una sentencia SQL condicional bloquea los registros pertinentes y aprueba guion y todos sus assets conjuntamente, o ninguno. Una ejecución posterior hace que la anterior deje de ser exportable como la publicación actual. Los registros históricos permanecen.

### Configuración previa

`OPENAI_API_KEY` y `CREATIVE_MAX_RUNS_PER_DAY` son los existentes. `CREATIVE_GEO_MODEL` configura el extractor (por defecto Luna). `CREATIVE_GEO_CONTACT` identifica la instalación ante Wikimedia y habilita consultas. R2 requiere su configuración habitual. Para mapas se añaden `CREATIVE_GEO_MAPTILER_KEY` y `CREATIVE_GEO_MAPTILER_EXPORT_ENABLED=true` únicamente con un plan que permita almacenamiento y exportación previstos. No se han creado credenciales ni modificado `.env.local`. La búsqueda web e imágenes usa la clave OpenAI existente, sin depender de `CREATIVE_GEO_CONTACT`. Sin configuración o evidencia para composición se prepara tipografía, conservando las fuentes encontradas para revisión final, sin preguntas intermedias.

Referencias de los adaptadores: [Wikidata: acceso a datos](https://www.wikidata.org/wiki/Wikidata:Data_access), [API Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo), [reutilización de Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [mapas estáticos de MapTiler](https://docs.maptiler.com/cloud/api/static-maps/) y [atribución](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/). MapTiler documenta que su API estática requiere un plan de pago; una clave por sí sola no acredita derechos de exportación del plan contratado.

### Validación de esta implementación

351 pruebas pasan, incluyendo ejecución del orquestador con dependencias simuladas, resolución de homónimos/ámbitos, exclusión por permisos desconocidos, ausencia de aprobaciones intermedias, aislamiento por tema, conflictos y conservación de píxeles del original mediante Sharp real. TypeScript y lint pasan. El build de Turbopack se queda en `Creating an optimized production build`; Webpack confirma el bloqueo previo de `:root` no puro en los CSS Modules generados. Una prueba real aislada de Luna con búsqueda web devolvió 12 fuentes y dos fotografías candidatas en una llamada de búsqueda. No se ha ejecutado el recorrido completo contra la base de datos de producción ni se ha validado una fotografía real de la plaza del piloto. GEO-07 permanece en revisión, sin marcar aceptación hiperlocal como completada.

### Búsqueda web e imágenes integrada

Luna dispone de `web_search` en Responses, con resultados de texto e imagen. El servidor conserva únicamente URLs devueltas por las llamadas de herramienta completadas (`action.sources` y `results`), nunca URLs inventadas en el JSON del modelo. Deduplica y limita a 24 entradas por respuesta; registra llamadas y conserva enlaces a páginas y fotografías candidatas en el snapshot y la revisión final. La búsqueda también se ejecuta para menciones genéricas, múltiples y noticias sobre cambios de estado, aunque esas circunstancias impidan componer una imagen documental.

La revisión incluye enlaces de búsqueda de Google Maps construidos con el nombre literal y el ámbito de marca, sin clave de Google. Están identificados como búsquedas sin ubicación verificada: no son mapas renderizados ni una integración de Places API. Las fotos descubiertas no se descargan ni se incorporan a la publicación por el mero hecho de aparecer en resultados. La resolución para composición sigue usando Wikidata; la ingestión automática de nuevas fuentes web con verificación de identidad y permisos queda pendiente. Una clave de búsqueda OpenAI por sí sola no habilita mapas exportables.

El hash de preparación incluye la versión de descubrimiento para evitar reutilizar resultados anteriores sin búsqueda web. Los snapshots históricos siguen siendo legibles. El resto de las llamadas editoriales a OpenAI mantiene su comportamiento sin herramientas.

## Papel de Luna

Proponemos `gpt-5.6-luna` para extracción estructurada de lugares, preparación de consultas y clasificación preliminar de candidatos. Su entrada admite texto e imágenes y su salida es texto, según [OpenAI Docs](https://developers.openai.com/api/docs/models/gpt-5.6-luna). La asignación de estas tareas es una decisión de diseño que debe validarse con ejemplos de la marca antes de habilitarla.

- Luna propone nombres, fragmentos de evidencia, consultas y razones de coincidencia; no inventa URLs, coordenadas, fuentes o licencias.
- La búsqueda y geocodificación las realizan proveedores explícitos mediante herramientas del servidor. El modelo solo selecciona IDs de resultados realmente recibidos.
- La única revisión humana final confirma conjuntamente identidad, actualidad, autorización de uso y pieza terminada. La similitud visual y la confianza del modelo no sustituyen esas comprobaciones.
- En fotografía obligatoria no se llama a un generador para reconstruir el lugar: se compone sobre el original elegible con herramientas deterministas; la pieza espera la revisión final.
- El generador de imágenes existente solo participa en ilustración editorial o referencia ilustrada, con el tratamiento visible correspondiente.
- El modelo es configurable; una indisponibilidad utiliza datos reutilizables o termina con una pieza tipográfica o un resultado bloqueado para revisión final y no dispara modelos más caros ni elimina restricciones sin una política explícita.

## Política de representación

El perfil define el valor predeterminado y la publicación guarda su decisión efectiva como snapshot. La configuración incluye municipio, región y país, establecidos previamente para la marca: el nombre salut.st.jean no basta para inferirlos.

| Modo | Comportamiento |
|---|---|
| Ilustración editorial | Representación conceptual identificada como ilustración; nunca una reconstrucción presentada como fotografía del lugar. |
| Referencias verificadas | Generación a partir de referencias elegibles para ese uso; continúa siendo una ilustración que puede alterar detalles. |
| Fotografía real obligatoria | Original elegible con composición, texto y marca, pendiente de aprobación final. Sin generación, reemplazo ni expansión artificial del lugar. |

Para el piloto se recomienda fotografía obligatoria cuando una unidad muestra un lugar identificado. La asignación de fotos es por slide/unidad: una fotografía no puede representar silenciosamente varios lugares distintos. Las unidades puramente tipográficas siguen disponibles.

## Entregas y alcance

| Entrega | Historias | Resultado |
|---|---|---|
| Preparación automática | GEO-01 a GEO-06, GEO-08, GEO-09, GEO-11 y GEO-12 | Identificación, biblioteca, búsqueda, fotografía o mapa deterministas, alternativa tipográfica y una única revisión final. |
| Validación de entrega | GEO-07 | Pruebas del recorrido completo y validación hiperlocal final. |
| Opción posterior | GEO-10 | Ilustración explícita con referencias; excluida del recorrido que exige exactitud documental. |

No incluye publicar automáticamente, reconocer identidades de personas, certificar licencias mediante IA ni asegurar que una imagen de archivo representa el estado actual. No se habilita scraping de Google Maps ni uso automático de sus capturas: GEO-11 debe verificar las condiciones del proveedor elegido antes de integrar su material.

## Historias

### GEO-01 — Configurar fidelidad visual y ámbito geográfico

**Como** editor de una marca local, **quiero** definir cómo se representan lugares, **para** evitar imágenes engañosas por defecto.

**Prioridad:** P0 · **Dependencias:** ninguna · **Entrega:** Preparación automática

**Criterios de aceptación**

- El perfil permite elegir los tres modos y registrar municipio, región y país; se puede seleccionar una ubicación validada posteriormente.
- Los perfiles existentes conservan su comportamiento hasta que el editor cambie la política.
- Cada publicación muestra la política heredada y permite un override explícito con motivo. Cambiar de fotografía obligatoria a ilustración nunca es un fallback silencioso.
- Cambiar la política invalida la aprobación de los assets afectados y crea una nueva versión sin modificar el histórico.
- La UI usa UXDSL, la paleta de la marca y los breakpoints del proyecto.

> **Estado de implementación (GEO-01).** La política vive en `creative_profiles`
> (`visual_fidelity_mode`, `geo_scope` jsonb, `visual_policy_version`). El
> override por publicación son cuatro columnas en `creative_drafts`
> (`visual_fidelity_override*`); la política heredada efectiva se lee del
> perfil vigente tanto al editar como al generar. El `profileSnapshot` conserva
> la procedencia del brief. `visual_policy_version` sólo
> avanza cuando cambian el modo o el `geo_scope`.
>
> - **Enforcement (contra la política vigente, no el snapshot):**
>   `generateCreativeDraftAssets`, `generateNextCreativeDraftAssetVersion`,
>   `regenerateCreativeAsset` y aprobar una imagen leen
>   `getTopicVisualFidelityMode(topicId)` y lanzan `CreativeContentConflictError`
>   si el modo efectivo es `photo-required` o `verified-references`. Solo
>   `illustration-editorial` permite generación libre; la composición sobre foto
>   real es GEO-06 y el flujo de referencias aprobadas es GEO-09/GEO-10.
> - **Caché del brief:** `createBriefInputHash` añade modo, `geoScope` y
>   `visualPolicyVersion` **solo cuando `visualPolicyVersion > 1`**, así que los
>   briefs pre-GEO en la política por defecto conservan su hash al desplegar y
>   un cambio real de política sí invalida la caché.
> - **Invalidación (idempotente, en cada save del perfil):** cada borrador con
>   snapshot obsoleto que esté aprobado o tenga un lote vivo sube de versión y
>   sus lotes de esa versión o anteriores pasan a `stale`, en una sentencia
>   SQL atómica. Un CTE enlaza el retiro al UPDATE exitoso del borrador,
>   condicionado por versión y estado. Si falla la comparación, no se retiran
>   lotes ni se incrementa el contador. **No se toca ninguna fila de
>   `creative_assets`**: el lote anterior y sus imágenes aprobadas quedan como
>   histórico; la versión nueva no tiene lote y se regenera bajo la política
>   vigente.
> - **Override del borrador:** cada decisión guardada crea una versión mediante
>   la misma operación atómica; un cambio concurrente devuelve conflicto. Los
>   cambios de fidelidad están deshabilitados mientras hay texto sin guardar.
>   Salir de `photo-required` no se hace
>   "limpiando" el override (se rechaza); requiere fijar un modo explícito con
>   motivo y actor, que se persisten en `visual_fidelity_override*`.
> - **Regresiones de esta revisión:** siete pruebas con almacenamiento y
>   solicitudes simulados cubren política vigente, motivo/actor, conflictos,
>   SQL de retiro condicionado y protección de texto sin guardar. Pasan las
>   323 pruebas, lint, TypeScript y db:check. El build de Turbopack agota
>   120 segundos; la alternativa Webpack falla por el selector `:root` en
>   CSS Modules generados. La validación integral de GEO-07 sigue pendiente.
>
> **Supuesto a estrechar:** hasta que GEO-03..06 vinculen lugares a unidades
> concretas, "assets afectados" = todos los aprobados del tema con snapshot
> obsoleto (sobre-invalidación deliberada). Migración
> `drizzle/0041_petite_randall_flagg.sql`.

### GEO-02 — Extraer menciones de lugares con Luna

**Como** editor, **quiero** recibir los lugares mencionados en la noticia, **para** seleccionar qué debe aparecer en cada imagen.

**Prioridad:** P0 · **Dependencias:** GEO-01 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Luna devuelve JSON validado con nombre literal, tipo, fragmento exacto de evidencia y contexto geográfico disponible; los campos desconocidos quedan vacíos.
- Se distinguen lugar del evento, lugares secundarios y menciones genéricas como “la plaza pública”.
- Las coordenadas nunca proceden de una inferencia del modelo; se reservan para un proveedor o confirmación manual.
- Artículo, metadatos e imágenes se tratan como datos no confiables, nunca como instrucciones.
- Una ambigüedad excluye ese lugar de la representación automática y se explica al final. La corrección manual se ofrece en la revisión final, no como requisito intermedio.
- Se registran modelo, versión de entrada, uso y fallos; se limita a una extracción y un reintento de estructura por versión, con caché y alternativa automática tipográfica o bloqueada para revisión final.
- Se conserva el idioma y los nombres locales, incluyendo francés y variantes con acentos.

### GEO-03 — Resolver la identidad del lugar con evidencias

**Como** editor local, **quiero** recibir la identidad resuelta y sus evidencias junto a la pieza final, **para** evitar confundir sitios homónimos sin intervenir durante la preparación.

**Prioridad:** P0 · **Dependencias:** GEO-02 · **Entrega:** Preparación automática

**Criterios de aceptación**

- La ficha registra nombre, municipio, región, país, dirección o descripción y evidencia de identificación; coordenadas son opcionales en el MVP.
- La resolución automática exige coincidencia de identidad y ámbito sustentada por registros reutilizables o fuentes verificables. Un score del modelo no la confirma; evidencias incompatibles o insuficientes excluyen la representación y se muestran al final.
- No se inventa una entidad cuando el nombre no existe o no puede resolverse; se prepara una pieza tipográfica y se reserva corregir o aportar evidencia para la revisión final.
- Una publicación puede tener varios lugares, cada uno con su identificación y estado independientes.
- Cada unidad que representa un lugar guarda su vínculo explícito. Una imagen solo se reutiliza si corresponde al mismo lugar y propósito.

### GEO-04 — Incorporar fotografías y registrar procedencia

**Como** editor, **quiero** que el sistema reutilice fotografías de la biblioteca o incorpore material de fuentes habilitadas, **para** disponer de imágenes reales sin seleccionarlas durante cada publicación.

**Prioridad:** P0 · **Dependencias:** GEO-03 · **Entrega:** Preparación automática

**Criterios de aceptación**

- La ingestión automática acepta material propio o con condiciones de uso registradas y compatibles con la preparación y destino previstos; que una foto aparezca en una noticia no supone permiso para reutilizarla.
- Cada original guarda hash, dimensiones, tipo, lugar, fuente, autor conocido, condiciones de uso, atribución requerida y fecha de captura cuando exista.
- La fecha de descarga nunca se usa como fecha de captura. “Fecha desconocida” es un valor válido.
- Los archivos se validan por contenido, tamaño y dimensiones, se almacenan mediante las abstracciones privadas de R2 y se entregan con acceso controlado.
- Se conservan originales y versiones sin reemplazos destructivos. Los metadatos privados no se incorporan automáticamente a la exportación pública.
- La biblioteca está aislada por tema; no se reutilizan fotos privadas entre marcas sin una acción autorizada.

### GEO-05 — Evaluar elegibilidad y reunir evidencia para revisión final

**Como** responsable editorial, **quiero** recibir la pieza terminada con la evaluación de identidad, actualidad y uso de su material, **para** decidir una sola vez al final.

**Prioridad:** P0 · **Dependencias:** GEO-04 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Identidad del lugar, autorización de uso y pertinencia temporal se evalúan automáticamente por separado. Solo material que cumple las tres condiciones es elegible; esa clasificación no constituye aprobación humana.
- La revisión final muestra original, procedencia, condiciones de uso, evidencia, fecha conocida y contexto: actual, archivo o fecha desconocida.
- Una foto de archivo no se presenta como prueba del estado actual ni de que ocurrió el evento narrado. Se incluye una indicación visible cuando sea necesaria.
- Si la noticia depende del estado actual —por ejemplo, una reforma o cierre—, se excluye de la composición documental cualquier fotografía que no lo demuestre. Un mapa no sustituye esa evidencia; se prepara tipografía con el texto sustentado.
- Se registran reglas, evidencia y motivo de elegibilidad o exclusión; las candidatas dudosas se excluyen de la composición. Aprobador, fecha y decisión se registran únicamente al revisar la pieza final.
- Cambiar el lugar, archivo o condiciones de uso invalida la elegibilidad y el resultado preparado o aprobado afectado, conservando el historial y exigiendo nueva revisión final de la nueva versión.

### GEO-06 — Componer assets con fotografías reales

**Como** editor, **quiero** crear un post o carrusel usando originales elegibles, **para** conservar la apariencia real del lugar y la identidad de mi marca.

**Prioridad:** P0 · **Dependencias:** GEO-01 y GEO-05 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Fotografía obligatoria utiliza composición determinista sobre el archivo original y no solicita text-to-image, image-to-image, inpainting ni expansión generativa del lugar.
- Permite encuadre, escala proporcional, zonas de texto, contraste de legibilidad y marca; no elimina ni añade edificios, personas, monumentos o elementos del lugar.
- Se respeta 4:5 a 1080×1350. Cuando el original no encaja, se ofrece recorte revisable o márgenes de diseño, sin inventar contenido fuera del encuadre.
- Un original con resolución insuficiente se señala; se permite sustituirlo o usar otro diseño sin reconstrucción generativa encubierta.
- La vista previa muestra atribución y rótulos de archivo/ilustración cuando correspondan, y estos sobreviven a la exportación.
- Sin foto elegible, se intenta el mapa determinista si existe localización verificada y es adecuado para la noticia; en otro caso se prepara tipografía. La revisión final explica “Falta fotografía verificable”. No se genera un lugar sustituto ni se solicita intervención intermedia.
- Cada asset guarda snapshot del lugar, original, recorte, política, atribución y evidencias de elegibilidad utilizadas, reutilizando el modelo de versiones existente.
- El guion y los assets se preparan sin aprobación humana previa. Una única revisión final aprueba el conjunto exacto; la biblioteca y la elegibilidad no aprueban automáticamente la publicación.

### GEO-07 — Validar el flujo hiperlocal y sus regresiones

**Como** responsable de calidad, **quiero** comprobar la política con casos reales de la marca, **para** lanzar el MVP sin representaciones engañosas.

**Prioridad:** P0 · **Dependencias:** GEO-12 · **Entrega:** Validación de entrega

**Criterios de aceptación**

- El recorrido automático completo no exige clics, confirmaciones ni aprobaciones antes de la bandeja final, incluidos errores, ambigüedades y falta de configuración.
- Fixtures cubren plaza sin nombre, homónimos, nombre francés, varios lugares, lugar no encontrado, fotografía de archivo y permiso desconocido.
- Se verifica que fotografía obligatoria nunca llama al generador, incluso ante error, timeout o falta de material.
- Pruebas cubren cambio de política, sustitución de foto, respuesta de Luna desactualizada y edición concurrente: ningún resultado viejo aprueba una versión nueva.
- Se comprueba trazabilidad, aislamiento por tema, atribución exportada y conservación de assets históricos.
- Se evalúa Luna sobre un conjunto revisado por el editor local, registrando extracciones correctas, ambigüedades y selecciones erróneas; no basta un score autodeclarado.
- El editor valida visualmente una publicación de la plaza de salut.st.jean con material confirmado, además de casos sin foto que terminan en mapa adecuado, tipografía o bloqueo final justificado. Esta validación del producto no introduce revisiones intermedias por publicación.
- Pasan pruebas relevantes, lint, build y db:check cuando haya migraciones. Cualquier bloqueo del entorno queda documentado.

### GEO-08 — Resolver ubicaciones mediante búsqueda y geocodificación

**Como** editor, **quiero** obtener candidatos geográficos verificables, **para** reducir la búsqueda manual sin confundir localidades.

**Prioridad:** P0 · **Dependencias:** GEO-03 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Se integra un proveedor elegido tras verificar cobertura, coste, condiciones y reglas de almacenamiento; sus IDs, coordenadas y fuentes se guardan según esas condiciones.
- Las consultas incluyen el ámbito geográfico confirmado. El sistema separa resultados exactos, aproximados y fuera del municipio; solo selecciona los que cumplen los criterios de identidad y deja las razones visibles al final.
- Luna prepara consultas o clasifica IDs devueltos; no convierte una coincidencia textual en una ubicación confirmada.
- Sin evidencia suficiente, se excluye la localización de la representación y se adjuntan los candidatos a la revisión final, sin preguntas intermedias. No se atribuye una precisión inexistente a un centroide municipal.
- Las solicitudes se ejecutan en servidor con límites, caché permitida y reintentos acotados. No se exponen claves ni URLs internas.

### GEO-09 — Buscar fotografías candidatas del lugar confirmado

**Como** editor, **quiero** encontrar fotografías con procedencia verificable, **para** disponer de alternativas cuando la biblioteca no tiene material.

**Prioridad:** P0 · **Dependencias:** GEO-04 y GEO-08 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Orden de búsqueda: biblioteca propia, imágenes del artículo como candidatas, fuentes oficiales y otros repositorios habilitados.
- Cada resultado conserva página de origen, URL real del recurso, autor/licencia cuando estén disponibles, fecha y evidencia de correspondencia con el lugar.
- Luna puede ordenar candidatos y señalar inconsistencias; ninguna imagen queda aprobada automáticamente por parecido visual.
- Se separa permiso para visualizar una candidata de permiso para descargarla, almacenarla, transformarla o publicarla. Las condiciones desconocidas excluyen ese material de la ingestión o transformación automática correspondiente y se explican al final.
- Descargas externas validan protocolo, destinos y redirecciones, bloquean redes privadas y limitan tamaño, tipo y tiempo. URLs propuestas por el modelo no se descargan sin validación.
- Búsquedas repetidas deduplican candidatos y respetan límites del proveedor. Se registra uso/coste; se devuelve una lista finita y revisable.
- Si falla la búsqueda o no hay una foto elegible, se intenta un mapa adecuado o se entrega tipografía para revisión final, sin sustituir el lugar por uno generado.

### GEO-10 — Preparar ilustraciones con referencias elegibles

**Como** editor, **quiero** ilustrar una noticia usando referencias elegibles del lugar, **para** mantener contexto visual cuando he elegido explícitamente una representación artística.

**Prioridad:** P2 · **Dependencias:** GEO-05 y GEO-07 · **Entrega:** Opciones adicionales

**Criterios de aceptación**

- Solo disponible en modo de referencias verificadas; utiliza el endpoint image-to-image explícito del proveedor existente.
- Se comprueba que las condiciones del material permiten ese uso y su envío al proveedor antes de transmitirlo.
- El prompt cita los IDs de referencias seleccionadas y evita afirmar que el resultado documenta la realidad.
- El resultado lleva “Ilustración” en la pieza y permite revisar las referencias junto a la salida.
- El editor puede rechazar alteraciones del lugar; el modelo no certifica su propia fidelidad.
- Si el objetivo exige exactitud documental, se ofrece cambiar a fotografía real en una nueva versión, no aprobar la ilustración como fotografía.

### GEO-11 — Crear mapas con ubicaciones verificadas

**Como** editor, **quiero** mostrar dónde está el lugar, **para** aportar contexto geográfico cuando sea más útil que una fotografía.

**Prioridad:** P0 · **Dependencias:** GEO-06 y GEO-08 · **Entrega:** Preparación automática

**Criterios de aceptación**

- El mapa se renderiza de forma determinista desde coordenadas confirmadas y un proveedor cartográfico configurado; Luna no dibuja calles ni coloca marcadores.
- Se verifican licencia, atribución, almacenamiento, exportación y compatibilidad con publicación social antes de habilitar el proveedor.
- Google Maps puede ser una fuente de localización si se integra de forma permitida; no se presupone permiso para reutilizar capturas ni Street View.
- Se mantiene escala y posición del marcador; si la precisión es aproximada, se indica o se bloquea un marcador puntual engañoso.
- Atribución y contexto permanecen legibles en la exportación 4:5. El mapa no sustituye evidencia fotográfica del estado actual del lugar.
- Si el mapa no está disponible, se termina con fotografía elegible o tipografía, nunca cartografía inventada ni una solicitud de intervención intermedia.

### GEO-12 — Orquestar preparación automática y revisión final única

**Como** editor, **quiero** recibir una publicación terminada con su evidencia sin intervenir durante la preparación, **para** revisar una sola vez al final.

**Prioridad:** P0 · **Dependencias:** GEO-02 a GEO-06, GEO-08, GEO-09 y GEO-11 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Una ejecución recorre extracción, resolución, biblioteca/búsqueda, elegibilidad, guion y composición sin exigir aprobación intermedia. La configuración previa de la marca no se solicita de nuevo por publicación.
- El orquestador utiliza estados de preparación propios. No llama automáticamente a las acciones de aprobación humana de guion, fotografía o asset ni falsifica actor o `approvedAt` para atravesar las protecciones actuales.
- Orden de salida: fotografía elegible; mapa con coordenadas verificadas si es pertinente; tipografía con hechos sustentados. Si ninguna pieza segura es posible, resultado bloqueado en la bandeja final. Ninguna rama genera artificialmente el lugar ni relaja la política documental.
- Cada rama registra sus razones, procedencia y material usado. Biblioteca y caché se reutilizan por tema/lugar, con nueva comprobación de pertinencia temporal y condiciones de uso para cada noticia.
- Las tareas del servidor tienen límites de coste, tiempo y reintentos; al agotarlos entregan la alternativa o bloqueo final, sin quedar esperando una respuesta humana intermedia.
- La única pantalla final incluye pieza, guion, original/mapa, identidad, evidencia, atribución, fecha/contexto y restricciones. Permite aprobar la versión completa, rechazarla o corregir y relanzar. Una aprobación anterior nunca aprueba automáticamente una nueva versión.
- Artículo, ámbito, política, lugar y material quedan versionados. Los resultados asíncronos obsoletos no reemplazan decisiones nuevas ni llegan como aprobados a publicación.
- Publicación y exportación como material listo requieren la aprobación humana final vigente; las previsualizaciones anteriores permanecen como borradores. La autorización de esta historia es preparar automáticamente, no publicar automáticamente.

## Diseño técnico y decisiones pendientes

- Extender perfil, configuración de publicación y snapshots para la política efectiva; no cambiar retroactivamente assets aprobados.
- Persistir lugares, fuentes y originales con sus revisiones. Reutilizar repositorios, R2 privado, overlays, exportación y versionado de assets existentes; no tratar lugares como personajes de ficción.
- Selección y confirmación pertenecen al tema/publicación; la evidencia de una fuente no concede permisos a otras marcas.
- Separar servicios de extracción, resolución geográfica, búsqueda de medios, aprobación y renderizado. Proveedores y credenciales solo en servidor.
- Invalidar resultados asíncronos cuando cambien artículo, lugar, política o fuente. Una tarea antigua no debe sobrescribir la selección nueva.
- GEO-08/09/11 deben elegir proveedores y registrar límites, costes y condiciones vigentes; este documento no autoriza ni presupone el uso de Google Maps u otro servicio concreto.
- Criterio de entrega: cada ejecución termina autónomamente en una pieza revisable o un bloqueo final explicado. La biblioteca reduce trabajo repetido; la indisponibilidad de Luna o proveedores no introduce intervención humana intermedia.
- GEO-08, GEO-09 y GEO-11 forman parte de la entrega automática; no se consideran mejoras opcionales si se ofrece búsqueda externa o mapa como alternativa. GEO-07 valida después de GEO-12 para evitar dependencias circulares.

## Uso del tablero en VS Code

Un tablero por feature en markdown: [`real-place-visual-fidelity.kanban.md`](real-place-visual-fidelity.kanban.md). Formato de la extensión **Markdown Kanban** (`holooooo.markdown-kanban` v2): `#` título, `##` columnas, `### ID — título` como tarjetas (atributos como `- priority:` / `- tags:` indentados debajo). Clic derecho en el `.kanban.md` → «Kanban» (o «Open Kanban Board» en la paleta); el selector de la barra alterna entre features. Arrastrar reescribe el archivo.

Detalle de cada historia (user story + criterios) en [`../stories/GEO-01.md`](../stories/) … — notas Foam, editables a mano; el cuerpo bajo `<!-- body -->` no lo toca el sync.

Tras mover tarjetas: `python3 scripts/foam-sync.py` regenera las notas de historia, los `status-*`, [`../PROJECT.md`](../PROJECT.md) y el índice de abajo. El `.kanban.md` es la fuente del estado; el cuerpo de cada nota de historia (bajo `<!-- body -->`) es la fuente del texto y no lo toca el sync.

## Historias (Foam)
<!-- foam-stories -->

[[GEO-01]] · [[GEO-02]] · [[GEO-03]] · [[GEO-04]] · [[GEO-05]] · [[GEO-06]] · [[GEO-07]] · [[GEO-08]] · [[GEO-09]] · [[GEO-10]] · [[GEO-11]] · [[GEO-12]]

## Protección ante fuentes insuficientes

El [plan de suficiencia editorial y representación documental](editorial-evidence-guardrails.md) describe las protecciones añadidas tras el caso de los tramos de Saint-Sébastien / Saint-Jean: bloqueo de fragmentos sin evento y rechazo de mapas o reconstrucciones explícitas por el generador. Este control no certifica precisión geográfica ni cierra GEO-07.

## Integración MTMD en el draft existente (septiembre 2026)

La composición local de un draft con dirección geográfica consulta el WFS oficial `ms:chantiers_mtmdet` del MTMD antes de usar tipografía. La coincidencia exige el mismo número de ruta, localización, dirección y fechas/horas inicial y final en un único registro completo citado por el brief. Rechaza respuestas incompletas, geometría inválida, duplicados y conflicto entre el ID de la URL individual y el registro. No convierte km en coordenadas inferidas.

La portada puede recibir el trazado LineString oficial sobre MapTiler; conserva geometría, ID, actualización, fuente, fecha de consulta y hash del mapa en `unitSnapshot.roadMapEvidence`. El resto de unidades conserva tipografía y el texto aprobado. La fuente se vuelve a comprobar al aprobar/exportar un mapa. La regeneración de assets de composición y de sus lotes usa el renderizador local, manteniendo versiones sin aprobarlas automáticamente. Las instrucciones generativas sobre un mapa se rechazan con indicación de editar el guion.

Fuente: [Travaux routiers — MTMD](https://www.donneesquebec.ca/recherche/dataset/travaux-routiers), CC BY 4.0, WGS84. El servicio oficial identifica `168598` como el aviso de Saint-Jean-sur-Richelieu hasta el 31 de octubre; el brief guardado de Saint-Sébastien hasta el 9 de octubre coincide con `153974`. Son avisos distintos.

La prueba local devolvió 202 con tres assets en el mismo draft y evidencia del aviso `153974`. No se generó mapa porque faltan `CREATIVE_GEO_MAPTILER_KEY` y `CREATIVE_GEO_MAPTILER_EXPORT_ENABLED=true`; el motivo queda visible bajo la imagen. La habilitación requiere un plan compatible con exportación y almacenamiento. No se cambiaron credenciales. La ficha HTML de 511 rechazó el acceso automatizado con Cloudflare; el WFS oficial sí respondió.

Alcance pendiente: búsqueda fotográfica integrada en este mismo recorrido, interpretación de fichas que no conservan el registro tabular completo, geometrías MultiLineString y validación visual con MapTiler real. Esta entrega no cierra GEO-A a GEO-F ni la aceptación hiperlocal.

**Integración posterior — 9 de septiembre de 2026:** [GMAP-11](google-maps-place-visuals.md#gmap-11--completar-el-piloto-dentro-del-draft-con-evidencia-de-dirección) conecta relaciones explícitas de proximidad de la fuente con un mapa OSM en el mismo draft. El caso de la Fête des récoltes utiliza la dirección de la biblioteca como referencia cercana, sin afirmar que el evento ocurre dentro de ella. Las demás unidades pueden usar símbolos conceptuales deterministas. El preview Google permanece separado de la exportación persistente.

## Corrección de preparación documental por escena — 10 de septiembre de 2026

El recorrido `Real places · automatic preparation` resuelve ahora cada extracto por separado. La extracción clasifica también el propósito de cada mención: una sede de evento puede ilustrarse como contexto de archivo, mientras una escena de obras o daños conserva su restricción. La comprobación de cambios físicos se aplica al título y texto visible de la escena, no indiscriminadamente a todo el artículo.

En carruseles se seleccionan hasta tres oraciones completas de la fuente, priorizando sedes distintas cuando son inequívocas. Las slides posteriores ya pueden recibir su propio original verificado o mapa; no heredan la foto de portada. Una escena con varios lugares o sin una mención nominal respaldada conserva texto, sin escoger una sede arbitrariamente.

La búsqueda solicita nombres completos y contexto geográfico. Los resultados visibles se filtran por coincidencia del nombre completo; siguen siendo candidatos informativos, no autorización para descargar o publicar fotos. La adquisición continúa mediante proveedores verificados y biblioteca privada, conservando identidad, licencia, atribución y comprobaciones de descarga. La resolución municipal admite que la ciudad sea la propia entidad buscada, siempre verificando región y país.

La revisión de búsqueda `scene-places-v2` diferencia la nueva preparación de resultados anteriores sin invalidar ni borrar sus snapshots. Para aplicar el cambio a una publicación guardada, usar **Prepare a new version** y realizar su revisión final. No se ha ejecutado una preparación real de la noticia de Journées de la culture durante esta corrección; la disponibilidad de una fotografía elegible depende del proveedor.

### Contacto geográfico por marca

El perfil creativo permite guardar `Geographic provider contact email` junto al ámbito geográfico. El servidor usa ese correo para identificar sus solicitudes; si está vacío utiliza `CREATIVE_GEO_CONTACT`. El contacto no se imprime en las publicaciones ni se incorpora al snapshot editorial de nuevos briefs. Guardar solo el contacto conserva la fecha editorial y no avanza la política visual; los fingerprints documentales excluyen esta columna.

La migración `0060_pink_lady_bullseye.sql` añade `creative_profiles.geo_provider_contact` vacío por defecto. La comparación geográfica normaliza acentos y guiones sin sustituir la comprobación de identidad, jerarquía y país del proveedor. Tras guardar el correo, usar **Prepare a new version** para repetir las búsquedas; cambiar la configuración no ejecuta búsquedas automáticamente.

### Integración con Generate images — originales aprobados

La generación de assets de un Script Draft comprueba ahora si la misma noticia y topic tienen una preparación documental aprobada y vigente. Solo reutiliza originales cuya sede aparece en la evidencia citada por la slide; no asigna una foto por similitud del texto ni por posición en otro carrusel. Verifica hash del archivo privado, vigencia de fuente, aprobación y, para fotos, licencia e incompatibilidad con afirmaciones de cambio físico.

Si hay recursos reutilizables, el carrusel utiliza la composición existente sobre su texto guardado: foto/mapa original más tipografía y elementos gráficos locales. No envía el original al generador para redibujarlo; la salida resultante necesita su propia revisión. Las slides sin asignación continúan por el resolver existente. No se crea otro Script Draft.

Los mapas puntuales de sedes muestran un barrio más cercano y el nombre del lugar; las ciudades y segmentos mantienen un ámbito mayor. Para obtener ese encuadre en un mapa guardado anteriormente, preparar una nueva versión documental. El proveedor evalúa hasta cuatro imágenes declaradas por la entidad verificada, sin descartar todas por existir varias; cada alternativa conserva las comprobaciones de licencia, tamaño, identidad y descarga. No se habilita la reutilización de fotografías arbitrarias encontradas en la web.


### Commons photo license compatibility

Documentary preparation and same-draft photo reuse accept CC0, CC BY 4.0,
and CC BY-SA 4.0. The shared validator canonicalizes HTTP/HTTPS and an optional
trailing slash only; unknown licenses, other versions, and unrelated hosts remain
ineligible. Author, source page, canonical license URL and attribution remain in
the versioned photo evidence and rendered credits.

The photo remains a separate archive image, fitted without cropping or generative
modification. Rendered credits disclose resizing. CC BY-SA applies to the photo;
this does not automatically license unrelated editorial copy or brand assets.
Future photo adaptation must preserve ShareAlike conditions and must not silently
send these originals through generative editing.
See [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Regression: Musée du Haut-Richelieu (Q18414858), whose Commons metadata reports
Yource and CC BY-SA 4.0 without a trailing slash, was previously rejected.
The provider fixture now exercises download, attribution, and shared eligibility.
Existing saved versions stay unchanged; use **Prepare a new version** to resolve
photographs with the updated policy.


Composition cache identity now includes the approved documentary originals,
slide assignments, credits and preparation timestamps. A newly prepared photo
therefore cannot reuse an older map-only composition when generating a new
batch. Single-slide regeneration also resolves approved documentary originals.
Reuse still requires a current approved documentary batch and an unambiguous
place match in the slide's cited facts; preparation alone is not approval.

The **next image batch version** action also checks approved documentary inputs
before replaying historical AI requests. If they differ, it creates a composition
batch while preserving the prior batch; unchanged compositions retain the normal
per-image version workflow. Regression coverage exercises an existing generative
batch receiving a newly approved photograph and rejects stale/foreign/pending
batches. Read-only verification of the Journées de la culture story confirmed
that slide 3 cites the museum and successfully rendered its approved R2 original
locally. No publication or paid image generation was triggered during verification.

### Per-slide creative and documentary composition

A verified museum photograph must not turn unrelated slides into generic
information icons. Composition version `place-visual-v4` selects the render path
per slide: verified originals use local composition; eligible non-geographic
slides use the existing creative prompt, immutable character references, brand
references, brand overlay and carousel chrome. Explicit typography and restrictive
photo policies retain their documentary fallback. Research is limited to slides
requiring geographic material, rather than unrelated covers.

Mixed batches retain per-asset endpoints. Retrieval polls pending AI requests,
while local photo assets are never submitted to the image provider. Whole-batch
versioning recomposes local assets and regenerates creative assets separately.
Regression tests cover slides 1/2/4 using creative generation, slide 3 preserving
the approved original, and photo-required policy disabling generative fallback.

### Opt-in photo reference experiment

Set the server-only environment variable
`CREATIVE_PLACE_PHOTO_REFERENCE_TEST_DRAFT_ID` to the selected draft UUID to
enable composition identity `place-visual-v5` for that draft only. Unset it to
return to pixel-preserving composition. Existing batches remain historical.

For eligible editorial-illustration slides, the approved museum photo is passed
as the final image to fal's reference-guided endpoint after character, brand and
optional edit-base references. The private original is read server-side and its
license freshness and SHA-256 are rechecked before submission. The stored slide
evidence marks the result as an AI-assisted adaptation, not an unchanged photo.
The prompt requests architectural fidelity and visible attribution/CC BY-SA
license credit. Review the generated building and credit text before approval;
prompt instructions alone do not guarantee either. Photo-required and
verified-reference restrictions remain in force.

For the experiment, generate a **new image batch version** after enabling the
variable; regenerating a historical local-composition asset keeps its old render
path. No schema change or source draft rewrite is needed.
