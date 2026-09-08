# Feature: Recolección por líneas editoriales

**ID:** FEAT-LINE-001  
**Estado:** MVP implementado — disponible para prueba editorial; LINE-07 en revisión  
**Marca piloto:** Canadá en Claro  
**Tablero:** [editorial-collection-lines.kanban.md](editorial-collection-lines.kanban.md)

## Registro de trabajo completado

La entrega y los ajustes posteriores se registran como historias completadas en [FEAT-ELW-001 — Flujo unificado de líneas editoriales](editorial-line-workflow.md), con su [tablero cerrado](editorial-line-workflow.kanban.md). El alcance futuro y las validaciones pendientes de este documento se mantienen diferenciados.

## Implementación disponible (2026-09-08)

- **Topics & Sources configura; Collection ejecuta.** La gestión de líneas (crear, editar, archivar/restaurar), periodos, objetivos, feeds y búsqueda IA aparece únicamente en Topics & Sources. En Collection se elige una línea guardada, se muestra su configuración efectiva y se puede escribir «Research today». No se repite el formulario ni se edita el periodo allí. Cada marca recibe automáticamente una línea editable «Actualidad» al cargar sus líneas o al recolectar por primera vez: 72 horas, feeds e IA heredados de la marca. La inicialización es idempotente y conserva líneas temáticas y cambios posteriores. No puede archivarse la línea inicial. Una única línea se selecciona automáticamente; con varias se exige elegir antes de habilitar Collect and save. Desaparece «Existing brand collection». Las solicitudes antiguas sin lineId se asocian a Actualidad; su ventana explícita se conserva en el snapshot de esa ejecución. Guardar una línea actualiza el selector de Collection.
- Cada línea puede heredar la búsqueda IA de la marca, desactivarla o personalizar instrucción, orientación, idioma, región, resultados, recuperación de contenido y prioridad. La búsqueda personalizada se activa independientemente del interruptor predeterminado de la marca; comparte proveedores, credenciales y cuota. La ventana siempre procede de la línea. Las opciones efectivas quedan en el snapshot de ejecución, sin credenciales. Las líneas anteriores mantienen su comportamiento. Esta ampliación usa el JSONB existente y no añade migraciones.
- La bandeja permite filtrar por línea o sin línea y consultar motivos/contexto. El selector está junto a la lista y se combina con «Shortlist only» en Collected stories; también filtra Selected stories. «Select visible shortlist» respeta ambos filtros. Creative Studio permite elegir la ejecución que fundamenta un nuevo brief; al abrir un draft existente conserva su contexto. El snapshot y el hash del brief incorporan esa decisión. Desde una vista con una sola línea se propone su contexto; si existen varias asociaciones se puede elegir en el Studio.
- La recolección aplica la ventana a RSS y a descubrimientos de IA, también después de la búsqueda. Los dominios se restringen en web search y al aceptar resultados. La búsqueda sin corte admite fechas desconocidas únicamente para contexto/guía y las presenta como desconocidas. No se reemplazan por la fecha de descarga.
- El evaluador recibe el contexto y no descarta automáticamente los estudios antiguos admitidos. Las noticias con ventana relativa siguen caducando cuando se evalúan más tarde. Se mantiene el suelo editorial de la marca y sus exclusiones; seleccionar una línea no garantiza aceptación.
- Las ejecuciones temáticas usan deduplicación exacta y asociaciones idempotentes; no fusionan artículos distintos por similitud durante la persistencia. Las protecciones generales de duplicados y revisión editorial del producto siguen vigentes. Recolectar de nuevo no aprueba una historia ni sus assets.
- `COLLECTION_MAX_RUNS_PER_DAY` (20 por defecto) limita Collect and save por marca, compartido entre líneas y entrada anterior. La reserva se hace bajo bloqueo transaccional del topic; los fallos también cuentan. La búsqueda web conserva sus límites existentes (hasta 8 llamadas de herramienta, 10 resultados y 90 segundos), además del presupuesto del evaluador. No se añadieron modelos ni credenciales.
- Migraciones **0055** y **0056**, aditivas y aplicadas a la base configurada: líneas, revisiones, ejecuciones, asociaciones y `collection_context` en briefs. La línea inicial se crea con su primera revisión sin modificar historias ni briefs existentes. No se crean líneas temáticas adicionales ni se modifica `.env.local`. Las historias asociadas se excluyen de la limpieza ordinaria por antigüedad; eliminar una marca mantiene las reglas de borrado del producto.

### Cómo probar el piloto

1. En Topics → Manage editorial lines, crear «Adaptación e integración», modo Context / studies, objetivo de adaptación de inmigrantes y 8760 horas (365 días).
2. Elegir feeds activos o heredarlos y configurar AI web search. Para una búsqueda independiente, elegir Custom AI search for this line e indicar la instrucción; para usar solo IA, seleccionar Selected feeds only sin marcar feeds. También se pueden combinar ambos. Inherit brand AI search usa el estado y opciones de la marca. Un RSS no garantiza acceso al archivo del medio.
3. En Collection elegir esa línea y escribir «Cómo afecta la soledad a los inmigrantes recién llegados a Canadá». Ejecutar Collect and save.
4. Consultar el resultado y sus errores/cobertura en Recent collection results; revisar candidatos en la bandeja filtrada por línea. Su evaluación/selección mantiene los controles existentes.
5. Abrir Open draft en una historia seleccionada y comprobar el contexto del nuevo brief. Una pieza basada en material antiguo debe indicar sus límites temporales y no presentarse como última hora.

### Validación y límites de entrega

Suite de 474 pruebas, lint, TypeScript, build y db:check verificados durante la implementación. Pruebas nuevas incluyen ventanas de actualidad/contexto, fechas desconocidas, restricciones de dominios, aislamiento por marca, revisiones, asociaciones idempotentes y cuota compartida usando PostgreSQL en memoria. La revisión verifica además la inicialización idempotente de Actualidad junto a líneas temáticas, aislamiento entre marcas y conservación de ediciones de la línea inicial. Incluye pruebas de herencia/desactivación/personalización IA, independencia del interruptor de marca, validación de opciones y renderizado que impide duplicar el formulario en Collection. El endpoint autenticado en localhost respondió 200 tras aplicar las migraciones y devolvió las fuentes configuradas.

**Pendiente de LINE-07:** el editor debe validar una búsqueda real y la publicación resultante. No se ejecutó una búsqueda de pago ni se certificó pertinencia editorial con proveedores reales. LINE-08 permanece fuera del MVP. La UI de rangos solicita timestamps ISO con offset explícito (no interpreta fechas ambiguas según la zona del servidor); la zona IANA de la línea se conserva en el snapshot. La bandeja de contexto carga hasta 2000 asociaciones recientes y el Studio hasta 30 ejecuciones por historia; para históricos mayores queda ampliar paginación. Una ejecución interrumpida por el proceso puede quedar marcada running; iniciar otra tiene un ID nuevo y no duplica la historia canónica. La reconciliación automática de ejecuciones interrumpidas queda pendiente.

## Problema y resultado esperado

La recolección de actualidad con una ventana de 72 horas funciona para novedades, pero no cubre todos los objetivos de una marca. Forzar esa ventana para temas como la soledad, la adaptación cultural o el sentido de pertenencia produce resultados escasos o repetitivos. Ampliar globalmente el periodo perjudicaría la selección de noticias recientes.

La marca necesita líneas editoriales con objetivos, fuentes y criterios temporales independientes. El editor elige qué investigar hoy y ejecuta «Collect and save» para esa línea. Los resultados llegan a la misma bandeja de la marca, con su contexto de investigación y los vínculos existentes a borradores y publicaciones.

**Decisión de dominio:** el `topic` existente sigue siendo el contenedor de marca, configuración, permisos y presupuesto. Una línea editorial es una entidad hija, no otro topic ni otra marca. Una consulta puntual pertenece a una ejecución de esa línea y no cambia sus valores predeterminados.

## Ejemplo: Canadá en Claro

Estos valores ilustran una configuración; no se crean ni se activan automáticamente.

| Línea | Objetivo | Periodo predeterminado | Fuentes orientativas |
|---|---|---|---|
| Actualidad | Explicar acontecimientos recientes relevantes para la audiencia | Últimas 72 horas | Fuentes periodísticas habilitadas por la marca |
| Adaptación e integración | Entender soledad, pertenencia y choque cultural | Últimos 12 meses | Periodismo, investigaciones y organizaciones con evidencia identificable |
| Guías prácticas | Resolver preguntas de vivienda, trabajo y servicios | Últimos 6 meses | Fuentes oficiales y material explicativo vigente |
| Historias de comunidad | Dar contexto mediante experiencias y testimonios | Sin corte por antigüedad | Medios comunitarios y fuentes habilitadas |

Ejemplo de ejecución:

> Marca: Canadá en Claro  
> Línea: Adaptación e integración  
> Buscar hoy: «Cómo afecta la soledad a los inmigrantes recién llegados a Canadá»  
> Periodo: últimos 12 meses  
> Acción: Collect and save

El sistema busca material sustentado relacionado con esa pregunta. No está obligado a encontrar una noticia de hoy ni a completar un número de resultados cuando no hay evidencia suficiente. Una pieza posterior puede explicar el tema usando un estudio, pero no presentar sus conclusiones como un acontecimiento reciente.

## Flujo de usuario

1. En Topics, dentro de la marca, el editor crea una línea con nombre, objetivo, temas, tipo de contenido, fuentes y periodo. Puede editarla o archivarla.
2. En recolección elige una línea; ve el objetivo, las fuentes efectivas y el periodo antes de ejecutar.
3. Opcionalmente escribe «Buscar hoy». Para modificar el periodo o las fuentes, vuelve a Topics & Sources y guarda la línea.
4. «Collect and save» investiga, valida resultados, deduplica y guarda candidatos sin confirmaciones intermedias.
5. La bandeja permite filtrar por línea. Cada resultado muestra por qué encaja, su fecha y el modo editorial: actualidad, contexto o guía.
6. Al seleccionar una historia y abrir Creative Studio se conserva ese contexto. Crear, aprobar o publicar sigue requiriendo las acciones editoriales existentes; recolectar no las ejecuta automáticamente.

La elección inicial de línea y consulta expresa la intención del editor; no agrega aprobaciones dentro de la búsqueda.

## Reglas de producto

### Periodo y vigencia

El periodo es una política explícita, no un valor especial escondido en `lookbackHours`:

- **Relativo:** últimas N horas o días, incluyendo equivalentes visibles como 72 horas o 12 meses. El servidor normaliza la elección y congela las fechas efectivas al iniciar la ejecución.
- **Rango:** desde/hasta, interpretados en la zona horaria de la marca y guardados como instantes UTC. Se rechazan rangos invertidos y fechas futuras para recolección retrospectiva.
- **Sin corte por antigüedad:** permite material antiguo; conserva un límite de resultados, consultas, duración y coste. No significa rastrear un archivo completo ni eliminar las comprobaciones de evidencia.

Fecha de publicación, fecha de actualización, periodo estudiado y fecha del evento son datos diferentes. La actualización de una página no rejuvenece automáticamente sus hechos. Un resultado sin fecha comprobable queda identificado como tal: se excluye de una búsqueda con rango estricto; en una búsqueda sin corte puede guardarse como candidato de contexto pendiente de comprobar vigencia, nunca como actualidad confirmada.

La antigüedad y la validez se evalúan por separado. Una investigación histórica puede ser pertinente; una guía con requisitos modificados puede dejar de serlo. Cuando la vigencia no pueda comprobarse, se registra la limitación y no se afirma que la información describe la situación actual. El feature no introduce asesoramiento ni una certificación automática de exactitud.

### Fuentes

Para los feeds, cada línea define `heredar fuentes de marca` o `seleccionar fuentes`, más exclusiones explícitas. En modo heredado, las fuentes efectivas son las activas de la marca más las selecciones adicionales, menos las exclusiones. En modo seleccionado, son únicamente las seleccionadas y activas, menos las exclusiones. Nunca se habilita una fuente desactivada ni se accede a fuentes privadas de otra marca.

La IA se configura por separado: heredar valores y activación de marca, desactivar o personalizar y activar para esa línea. Se puede ejecutar sin feeds seleccionados. Sus opciones reproducen las de la búsqueda IA existente, salvo la ventana temporal, que viene de la línea. No se duplican claves ni presupuestos.

La investigación web por IA es una capacidad de búsqueda, no una fuente editorial original. Se guardan las páginas realmente consultadas, sus editores y evidencia. Una restricción de dominios se aplica también a esa búsqueda; no se amplía silenciosamente si no encuentra resultados.

Un RSS suele ofrecer solo una selección reciente: pedir 12 meses no garantiza recuperar su archivo. El resultado de ejecución distingue búsqueda de archivo admitida, búsqueda web y lectura de feed. Si los conectores habilitados no cubren el periodo, informa de cobertura limitada; no declara que no existe información sobre el tema.

### Repetición y vínculos

Una historia puede encajar en varias líneas de la misma marca. Se conserva una historia canónica y asociaciones por línea/ejecución, sin duplicar borradores ni publicaciones. La deduplicación exacta sigue usando las identidades existentes; la similitud semántica propone coincidencias, pero no fusiona destructivamente artículos distintos.

Se consulta la cobertura previa de toda la marca. Un seguimiento con hechos nuevos puede admitirse explicando la novedad. En contexto, reutilizar un artículo conocido para otro ángulo puede crear una asociación y propuesta de enfoque, pero no una nueva historia ficticia. No se descarta todo lo que mencione «inmigración» o «soledad» por compartir palabras.

### Evaluación y generación

Actualidad prioriza novedad temporal. Contexto prioriza relación con la pregunta, calidad de evidencia y aporte frente a lo ya tratado. Guía prioriza utilidad y vigencia de la información. Los tres mantienen los requisitos editoriales de la marca y explican sus motivos; un modo de contexto no rebaja el estándar factual.

El brief recibe línea, objetivo, consulta efectiva, modo y límites temporales como snapshot. No debe inventar urgencia ni convertir un estudio antiguo en «última hora». Si una historia tiene varias asociaciones, se conserva la elegida al iniciar ese brief; abrir un borrador existente no cambia su contexto ni crea otra versión automáticamente.

## Alcance y entregas

**MVP:** gestión de líneas, fuentes y periodos; una línea por ejecución; consulta puntual; recolección y evaluación contextual; bandeja común filtrable; propagación al brief; compatibilidad y pruebas.

**Posterior:** ejecución de varias líneas en lote, programación por línea, sugerencias de equilibrio editorial y alertas de repetición. La marca no queda obligada a publicar una cantidad diaria.

No incluye crear otra jerarquía de marcas, calendario de publicación, publicación automática, scraping indiscriminado, acceso a archivos de pago ni garantizar cobertura histórica universal. El presupuesto existente de marca se comparte entre sus líneas; crear líneas no multiplica la cuota.

## Historias y tareas

### LINE-01 — Configurar líneas dentro de la marca

**Como** editor, **quiero** guardar objetivos editoriales independientes, **para** investigar más que actualidad sin duplicar mi marca.

**Prioridad:** P0 · **Dependencias:** ninguna

**Criterios de aceptación**

- Crear, editar, listar y archivar líneas con ID estable, nombre, objetivo, temas y modo `actualidad`, `contexto` o `guía`.
- Las operaciones y lecturas comprueban pertenencia al topic; los nombres no identifican permisos.
- Archivar impide nuevas ejecuciones, conserva asociaciones e históricos y permite consultar sus resultados.
- Editar crea una revisión de configuración; no altera ejecuciones ni briefs previos.
- La UI utiliza UXDSL y los breakpoints existentes.

**Tareas**

- [x] Definir entidad y repositorio de líneas, claves de pertenencia y revisiones.
- [x] Añadir endpoints autenticados con validación y control de concurrencia.
- [x] Incorporar sección «Líneas editoriales» en Topics.
- [x] Cubrir aislamiento, cambios concurrentes y archivo con historial.

### LINE-02 — Resolver fuentes y periodos efectivos

**Como** editor, **quiero** configurar fuentes y antigüedad por línea, **para** consultar material pertinente sin cambiar la actualidad de la marca.

**Prioridad:** P0 · **Dependencias:** LINE-01

**Criterios de aceptación**

- Soportar periodo relativo, rango y sin corte, con semántica temporal y fechas desconocidas definidas en este documento.
- Heredar o seleccionar feeds; aplicar exclusiones y estado activo de forma determinista.
- Permitir búsqueda IA heredada, desactivada o personalizada por línea, con los controles existentes y el periodo de la línea. Admitir feeds, IA o ambos.
- Mostrar fuentes y periodo efectivos; una configuración sin fuentes utilizables tiene explicación concreta.
- Diferenciar capacidad de consultar feeds y archivos; las restricciones no se relajan al fallar una búsqueda.

**Tareas**

- [x] Modelar la política temporal como unión tipada y convertirla a una ventana de ejecución.
- [x] Resolver selección/herencia de fuentes con aislamiento por marca.
- [x] Añadir controles de periodo, feeds y búsqueda IA en Topics & Sources, con ayuda sobre cobertura histórica.
- [x] Probar zona horaria, límites de ventana, fechas futuras/desconocidas y fuentes desactivadas.

### LINE-03 — Ejecutar Collect and save por línea

**Como** editor, **quiero** elegir una línea y una pregunta para hoy, **para** recolectar sobre una intención concreta sin reconfigurar la marca.

**Prioridad:** P0 · **Dependencias:** LINE-02

**Criterios de aceptación**

- La acción permite seleccionar una línea guardada, muestra fuentes/IA y periodo efectivos, y acepta una consulta opcional. La configuración se modifica únicamente en Topics & Sources.
- Guarda snapshot de configuración, objetivo, consulta, fuentes, opciones IA efectivas, ventana, zona horaria y revisiones.
- Los overrides no modifican la línea ni se filtran a la siguiente ejecución.
- Inicializa Actualidad en marcas sin línea inicial y conserva las líneas temáticas existentes. Toda nueva recolección usa una línea; las solicitudes antiguas se asocian a Actualidad. Ningún trabajo previo se cancela al desplegar.
- Una respuesta tardía no reemplaza el resultado visible de otra marca/línea seleccionada.

**Tareas**

- [x] Extender el contrato de recolección con línea y overrides validados en servidor.
- [x] Persistir identidad y snapshot de ejecución; aislar estado de UI por ejecución.
- [x] Añadir selector y campo «Buscar hoy» junto a Collect and save.
- [x] Probar compatibilidad del request antiguo y cambios de selección durante una búsqueda.

### LINE-04 — Buscar y evaluar según el propósito editorial

**Como** editor, **quiero** recuperar investigaciones y piezas de contexto además de noticias recientes, **para** recibir candidatos útiles sobre mi pregunta.

**Prioridad:** P0 · **Dependencias:** LINE-03

**Criterios de aceptación**

- Los conectores reciben consulta, modo y ventana efectivos; no queda un filtro global de 72 horas después de la búsqueda.
- La IA usa búsqueda real y devuelve evidencia verificable; artículo y resultados se tratan como datos no confiables.
- Evaluación diferenciada de actualidad, contexto y guía, sin penalizar automáticamente un estudio por antigüedad cuando el modo lo admite.
- Devuelve fechas y motivos, reconoce vigencia incierta y permite cero resultados válidos.
- Reserva presupuesto de marca, limita consultas/resultados/tiempo/reintentos y registra consumo, errores y cobertura parcial. Reintentos de la misma operación no duplican persistencia.

**Tareas**

- [x] Adaptar contratos de descubrimiento y filtros posteriores a la política temporal.
- [x] Pasar el objetivo a búsqueda y evaluación, con salida estructurada validada.
- [x] Registrar evidencia de fechas, pertinencia y vigencia sin fabricar metadatos.
- [x] Compartir límites de marca entre ejecuciones concurrentes y producir resultados parciales explicados.
- [x] Crear fixtures de actualidad, estudios antiguos útiles, guías desactualizadas y fuentes sin fecha.

### LINE-05 — Conservar asociaciones y evitar repetición entre líneas

**Como** editor, **quiero** saber dónde se encontró y cómo se trató una historia, **para** evitar duplicados sin perder enfoques nuevos.

**Prioridad:** P0 · **Dependencias:** LINE-03, LINE-04

**Criterios de aceptación**

- La misma historia recolectada por dos líneas mantiene un único ID y sus vínculos a drafts/publicaciones.
- Cada asociación conserva ejecución, consulta, motivo y fechas; la escritura es idempotente ante reintentos y concurrencia.
- La búsqueda considera cobertura de toda la marca; diferencia duplicado, seguimiento sustancial y nuevo enfoque de contexto.
- No fusiona historias de marcas distintas ni cambia aprobaciones por una nueva asociación.

**Tareas**

- [x] Añadir relaciones historia–línea–ejecución sin sustituir la identidad editorial existente.
- [x] Integrar la deduplicación existente y separar coincidencia exacta de recomendación semántica.
- [x] Alimentar la búsqueda con cobertura previa y guardar motivos de reutilización/novedad.
- [x] Probar duplicados concurrentes, artículos sindicados, seguimientos y conservación de drafts.

### LINE-06 — Revisar resultados y trasladar contexto al brief

**Como** editor, **quiero** filtrar candidatos por línea y conservar su intención al crear contenido, **para** publicar una pieza de contexto sin disfrazarla de noticia reciente.

**Prioridad:** P0 · **Dependencias:** LINE-04, LINE-05

**Criterios de aceptación**

- La bandeja común filtra por línea, incluyendo históricas archivadas y resultados sin línea.
- Las tarjetas muestran línea(s), modo, fecha conocida, motivo de selección y limitaciones de vigencia/cobertura.
- La creación de brief recibe la asociación elegida; desde un filtro de línea se preselecciona esa asociación, y desde la vista global se elige si hay varias.
- Abrir un draft existente conserva su snapshot, imágenes y publicación vinculada.
- La generación evita lenguaje de urgencia sin evidencia; elegir contexto no permite añadir hechos no sustentados.

**Tareas**

- [x] Extender DTOs y filtros de resultados conservando IDs actuales.
- [x] Añadir etiquetas y detalle de investigación con UXDSL.
- [x] Pasar el snapshot a generación y caché del brief; versionar cambios deliberados.
- [x] Verificar apertura de borradores existentes y factualidad temporal del texto generado.

### LINE-07 — Entregar el MVP compatible y validado

**Como** responsable del producto, **quiero** verificar el recorrido con casos de la marca y de otras regiones, **para** habilitarlo sin romper la recolección actual.

**Prioridad:** P0 · **Dependencias:** LINE-01 a LINE-06

**Criterios de aceptación**

- Una marca existente conserva configuración, fuentes, periodo y selección previos; no se aplica un backfill destructivo.
- Las filas históricas sin línea siguen visibles y vinculadas a sus drafts/publicaciones.
- Pruebas completas del caso «soledad de inmigrantes» con fuentes simuladas fechadas, y validación manual de una ejecución real sin exigir que produzca un número fijo de resultados.
- Pruebas de otra marca/región sin constantes específicas de Canadá, y aislamiento entre ambas.
- Cubrir errores de proveedor, presupuesto compartido, cambios concurrentes, periodos, duplicados y fechas desconocidas.
- Pasan pruebas relevantes, lint, build y db:check si hay migraciones; resultados y bloqueos quedan documentados antes de cerrar.

**Tareas**

- [x] Diseñar migración aditiva y despliegue compatible con registros/requests antiguos.
- [x] Probar el colector con fixture: 72 horas excluye estudio antiguo; contexto lo admite con su fecha original.
- [ ] Validar conectores reales configurados, fuentes accesibles y evidencia revisable.
- [ ] Documentar configuración, límites de cobertura y resultados de QA; actualizar tablero.

### LINE-08 — Automatizar una mezcla editorial (posterior)

**Como** editor, **quiero** programar búsquedas por línea y ver temas ya cubiertos, **para** mantener variedad sin depender de novedades diarias.

**Prioridad:** P1 · **Dependencias:** LINE-07 · **Fuera del MVP**

**Criterios de aceptación**

- Horarios independientes por línea y ejecución opcional en lote, con resultados separados y presupuesto total compartido.
- Sugerencias de variedad basadas en publicaciones previas, sin imponer cuotas de contenido ni publicar automáticamente.
- Una línea vacía no rellena resultados con duplicados ni amplía su periodo sin instrucción explícita.

**Tareas**

- [ ] Diseñar planificación por línea y control de solapamientos.
- [ ] Agregar vista de cobertura editorial y sugerencias explicadas.
- [ ] Definir prioridades cuando varias líneas compiten por presupuesto.

## Base técnica observada y decisiones de implementación

Actualmente `AiResearchSourceConfig` tiene configuración por `topicId`, con `instruction`, `lookbackHours`, idioma, región y límite de resultados. `collectAiResearchCandidates` calcula una ventana y vuelve a filtrar `publishedAt` después del descubrimiento. Por tanto, cambiar solo el prompt o añadir un selector no implementa este feature.

Puntos de extensión iniciales:

- `src/app/modules/topics/topic-catalog.repository.ts`: configuración y fuentes de la marca.
- `src/app/modules/sources/ai-research/ai-research.types.ts` y `ai-research.repository.ts`: configuración actual y compatibilidad.
- `src/app/modules/sources/ai-research/collect-ai-research-candidates.ts` y `openai-ai-research.ts`: ventana, descubrimiento y cobertura previa.
- `src/app/modules/stories/collect-and-persist-story-candidates.ts`: persistencia y asociaciones.
- `src/app/modules/stories/evaluate-editorial-candidates.ts`: evaluación contextual.
- `src/app/radar-dashboard.tsx`: entrada de recolección y bandeja.

Nombres propuestos de almacenamiento: `editorial_lines`, revisión/snapshot de ejecución y asociación con historias. Confirmar las tablas existentes antes de fijar la migración; reutilizar sus identidades y repositorios. No introducir una tabla paralela de drafts ni duplicar credenciales por línea. Las relaciones nuevas necesitan índices y restricciones de pertenencia e idempotencia.

La caché debe incluir marca, línea/revisión, consulta y ventana efectiva, modo, fuentes y versión de criterios. Una respuesta de otra línea no puede reutilizarse únicamente porque comparte `topicId`. La configuración se congela al ejecutar; cambios posteriores no reescriben el histórico, y una desactivación de acceso se vuelve a comprobar antes de llamar al proveedor.

**Orden de implementación:** LINE-01 → LINE-02 → LINE-03 → LINE-04 → LINE-05 → LINE-06 → LINE-07. LINE-08 queda en backlog. El estado operativo y los límites verificados constan en «Implementación disponible»; LINE-07 requiere validación editorial final y LINE-08 es posterior.
