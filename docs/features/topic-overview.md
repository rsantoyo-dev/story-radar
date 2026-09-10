# Feature: Topic Overview — centro de gestión editorial

**ID:** FEAT-OVW-001  
**Estado:** Planificado; esta entrega documenta el diseño, no lo implementa.  
**Fecha:** 10 de septiembre de 2026  
**Producto:** Press Craftor  
**Tablero:** [topic-overview.kanban.md](topic-overview.kanban.md)

## Objetivo y experiencia esperada

Al abrir un topic, el editor debe entender qué está pasando, qué merece cobertura, qué necesita su atención, qué está produciendo y qué se publicó. Desde esa misma pantalla debe poder continuar el trabajo exacto, conservando el contexto del topic.

Historia principal: **Como editor, quiero un informe completo y accionable de mi topic, para decidir qué cubrir y avanzar la producción sin buscar cada pendiente en secciones distintas.**

Overview organiza y resume; las herramientas existentes siguen siendo los espacios para editar, aprobar, configurar conexiones y autorizar publicaciones. Un acceso rápido abre el elemento o flujo correspondiente, no ejecuta una publicación, aprobación o generación pagada con un clic ambiguo.

## Punto de partida comprobado

`src/app/radar-dashboard.tsx` contiene `section#overview`: una cabecera genérica «Operate your radar from one place» y un contador `stats.stories`. El dashboard ya mantiene `selectedTopicId` y protege algunas respuestas asíncronas contra cambios de topic.

Existen secciones `#configuration`, `#editorial`, `#editorial-creative`, `#editorial-meta`, `#editorial-instagram` y `#settings`, además de herramientas de historias y drafts. Reutilizar sus componentes y acciones de navegación. Los enlaces a un draft específico o una lista filtrada deben implementarse explícitamente si no existen; no simularlos con un ancla genérica.

La publicación local de Instagram está probada por el usuario. Facebook, programación y video son ampliaciones planificadas: sus tarjetas solo se habilitan cuando sus capacidades reales estén disponibles. La feature de Overview no implementa esos conectores ni sus workers.

## Entregas y límites

| Fase | Resultado | Historias |
|---|---|---|
| 1: operación | Cabecera, contadores, pendientes, producción, publicaciones recientes, actividad y navegación | OVW-01 a OVW-07, OVW-10 |
| 2: informe editorial | Resumen generado y guardado, con evidencia y actualización explícita | OVW-08, ampliación QA de OVW-10 |
| 3: resultados y agenda | Métricas disponibles y agenda cuando exista programación | OVW-09, ampliación QA de OVW-10 |

Fuera de alcance: publicar/aprobar desde la tarjeta sin revisión, mejores horas calculadas, predicción de viralidad, bandeja de mensajes, editor de video, sincronización bidireccional con Business Suite y reescritura automática de drafts. No prometer gráficos históricos cuando solo existe una captura actual.

## Referencias visuales acordadas — 10 de septiembre de 2026

El usuario aportó dos capturas en la conversación. Referencia A: dashboard con sidebar oscuro, hero editorial ilustrado, cuatro indicadores, candidatos con miniaturas y columna de publicación/actividad. Referencia B: interfaz actual con sidebar oscuro, selector de topic y paneles amplios de evaluación/configuración. Las capturas no están guardadas como archivos en el repositorio; esta especificación conserva las decisiones para no depender de su disponibilidad posterior.

La referencia A guía la composición del Overview; la B aporta continuidad con la navegación y controles existentes. Mantener el informe completo del topic solicitado, combinado con candidatos accionables; no sustituir toda la portada por formularios de configuración o estadísticas de tokens.

| Elemento observado | Decisión de diseño | Historia responsable |
|---|---|---|
| Sidebar oscuro, agrupaciones e iconos | Adoptar jerarquía Workspace / Producción / Publicación / Configuración reutilizando destinos existentes, resaltado activo y drawer móvil | OVW-02, OVW-06 |
| Barra superior con topic | Mantener selector y estado real de conexión; evitar duplicarlo en la cabecera | OVW-02 |
| Hero editorial con ilustración | Título breve orientado al topic, propósito/audiencia y visual opcional aprobado; altura contenida para ver indicadores y primeras filas sin scroll en escritorio | OVW-02 |
| Cuatro tarjetas de indicadores | Conservar las definiciones operativas de esta feature; icono, valor, unidad y periodo. Seguidores se muestra en resultados cuando exista dato | OVW-01, OVW-02, OVW-09 |
| Top editorial candidates | Lista protagonista de hasta cinco candidatos con miniatura, fuente, antigüedad, evaluación vigente y Revisar | OVW-01, OVW-07 |
| Publishing status | Cuenta conectada, capacidad, últimas entregas y accesos al flujo de creación/publicaciones | OVW-05 |
| Today's activity | Timeline de eventos reales, no estados inventados a partir de timestamps | OVW-06 |
| Sources health | Resumen por estado con gráfico de anillo opcional y leyenda numérica accesible | OVW-05 |
| Quick actions | Panel dedicado de accesos contextuales a recolectar, revisar drafts, estudio y fuentes | OVW-07 |
| Your topics | Acceso compacto al selector/listado autorizado; no mezclar sus métricas con las del topic activo | OVW-02, OVW-06 |
| Evaluación IA y ajustes extensos de la referencia B | Acceso al panel especializado; en Overview solo resumen y siguiente paso | OVW-07 |

No copiar los datos, porcentajes, nombres, seguidores o estado «System healthy» de las capturas como valores de ejemplo de producción. Las tendencias requieren periodos comparables y cobertura real. Búsqueda global, notificaciones y menú de usuario de la referencia A no se incorporan como controles ficticios: solo reutilizarlos si existe funcionalidad, de lo contrario quedan fuera de alcance.

Respetar la paleta dinámica por temática que ya funciona en la aplicación (confirmado por el usuario). Overview hereda el tema activo mediante el mecanismo existente y los tokens UXDSL, incluidos superficies, sidebar, acentos, texto e iconos. Las referencias guían composición y contraste; sus colores no son valores obligatorios ni sustituyen la identidad de cada topic. Ilustración opcional propia del topic, desde assets aprobados y con derechos; no asumir Toronto para todos los topics ni generar imágenes al abrir Overview. Sin ilustración, la cabecera conserva una composición tipográfica completa. Un visual decorativo usa alternativa vacía y no contiene información necesaria.

## Distribución visual

Esquema de disposición final acordada:

```text
SIDEBAR OSCURO  | BARRA: selector topic · estado real · accesos existentes
               | HERO: propósito editorial del topic · visual opcional
               | Periodo · frescura · Actualizar datos
               | Historias nuevas | Atención | Producción | Publicadas
               | INFORME EDITORIAL / RESUMEN OPERATIVO (ancho completo)
               | CANDIDATOS EDITORIALES (2/3) | ATENCIÓN + PUBLICACIÓN (1/3)
               | Miniatura · título · fuente | Incidencias accionables
               | Score vigente · Revisar    | Cuenta · estado · accesos
               | PRODUCCIÓN: Historias → Briefs → Drafts → Imágenes → Posts
               | PUBLICACIONES RECIENTES    | ACTIVIDAD / timeline
               | SALUD DE FUENTES           | ACCIONES RÁPIDAS
               | RESULTADOS / AGENDA cuando haya capacidad y datos
```

Informe/resumen compacto de ancho completo, expandible para leer el detalle y fuentes; no debe desplazar los candidatos varias pantallas abajo. En fase 1 contiene síntesis operativa calculada; en fase 2 muestra el informe guardado con hasta cinco oportunidades. Candidatos permanece como lista independiente incluso cuando existe informe.

En móvil: barra/hero, indicadores, atención si hay pendientes, informe, candidatos, producción, publicación, acciones rápidas, salud, actividad y resultados. Sidebar como drawer accesible. Reubicar una sola instancia de la cola de atención; no duplicar DOM interactivo. En ausencia de pendientes, usar un mensaje compacto, no una columna vacía de altura fija.

## Catálogo de componentes propuestos

Los nombres siguientes son contratos de diseño e implementación, no componentes existentes.

| Componente | Contenido y disposición | Interacción y límites |
|---|---|---|
| `TopicOverview` | Contenedor semántico con título y regiones identificables | Recibe topic y datos; invalida resultados del topic anterior al cambiar |
| `TopicOverviewHeader` | Hero con nombre/propósito, visual aprobado opcional, periodo, zona y frescura; selector de topic en topbar | Selector 7/30/90 días; Actualizar datos; Configurar topic |
| `OverviewMetricCard` ×4 | Etiqueta, valor, alcance temporal y enlace descriptivo | Abre lista exacta; `—` si desconocido, `0` solo si consulta completa |
| `TopicEditorialReport` | Síntesis, cambios, 3–5 oportunidades como máximo y referencias | Abrir evidencia; Actualizar informe explícitamente; versión y antigüedad visibles |
| `TopicEditorialCandidates` | Hasta cinco filas con miniatura, título, fuente, antigüedad, score y estado de evaluación | Revisar abre candidato exacto; Ver todos conserva orden y filtros |
| `TopicQuickActions` | Hasta cuatro accesos contextuales con icono, título y explicación de una línea | Abren flujos existentes, sin generación/publicación implícita |
| `TopicAttentionQueue` | Hasta cinco pendientes ordenados por impacto y antigüedad | Abrir/resolver elemento; Ver todos; nunca descartar un error por mostrar solo cinco |
| `TopicProductionPipeline` | Cinco etapas, conteos y hasta tres piezas continuables | Etapa abre listado filtrado; pieza abre versión exacta |
| `TopicPublicationSummary` | Hasta cinco entregas recientes; agenda futura cuando esté disponible | Abrir detalle y post remoto; separar estado por destino |
| `TopicHealthPanel` | Fuentes/recolección, conexión y capacidades de publicación | Ir a configuración o historial; no afirmar que el worker vive sin heartbeat |
| `TopicActivityFeed` | Hasta ocho eventos, fecha y entidad | Abrir historia/draft/entrega; Ver más; identidad estable y sin duplicados |
| `TopicPerformanceSummary` | Métricas con cobertura y fecha de sync | Abrir analítica; no disparar sync de Meta al montar |
| `OverviewSectionState` | Skeleton, vacío, error parcial, datos antiguos o no disponible | Reintentar lectura de esa sección; conservar datos anteriores identificados |

### Cabecera y periodo

El nombre del topic es la identidad visual principal. La configuración técnica no ocupa el protagonismo del informe. El botón primario contextual se elige entre pendientes reales; «Actualizar datos» permanece secundario y solo vuelve a consultar datos propios.

El periodo afecta historias nuevas, entregas publicadas, actividad e informe editorial. Los pendientes y la producción representan el estado actual aunque su creación sea anterior; deben etiquetarse «Ahora». Guardar selección de periodo por topic sin almacenar credenciales. Calcular un único intervalo `[desde, hasta)` en servidor y devolverlo con la zona horaria efectiva; usar 30 días por defecto. La hora de consulta no equivale a hora de sincronización del proveedor.

### Contadores: significado verificable

| Indicador | Definición propuesta | Exclusiones y navegación |
|---|---|---|
| Historias nuevas | Historias distintas vinculadas al topic durante el intervalo, usando el timestamp de vínculo si existe | No usar fecha global del artículo como sustituto silencioso. OVW-01 confirma campo o cambia etiqueta. Abre el mismo conjunto |
| Necesitan atención | Número de entidades accionables distintas con incidencia vigente | Agrupar varias causas del mismo draft; no contar cada blocker como una pieza |
| En producción | Historias distintas con al menos una revisión creativa activa sin entrega final confirmada de esa revisión | Conservar múltiples formatos en detalle; no sumar etapas como total |
| Publicadas | Entregas remotas confirmadas en el intervalo, por plataforma y cuenta | Excluir contenedores listos, fallidas y resumen manual sin confirmación; mostrar desglose por destino |

Una historia puede tener un post histórico y una revisión nueva en producción. Una publicación en ambos destinos cuenta como dos entregas y una pieza editorial; hacer visible la unidad. Los contadores de etapas pueden solaparse y no se dibujan como tasas de conversión de un embudo.

### Informe editorial

Jerarquía: título «Qué está pasando en [topic]»; síntesis breve; hechos destacados; cambios con respecto a un periodo comparable solo si hay evidencia; oportunidades de cobertura; límites de cobertura y referencias. Cada afirmación factual debe enlazar historias/documentos que la sostengan, con fecha. Distinguir hechos, interpretación y propuesta editorial.

Una oportunidad contiene título, por qué importa a esta audiencia, evidencia disponible y una acción Abrir historia/Ver fuentes. Un máximo de cinco evita convertir el informe en otra lista interminable. No crear briefs ni aprobar enfoques automáticamente.

Generación explícita: Actualizar informe crea un trabajo o petición acotada mediante las abstracciones existentes, usa un snapshot de entradas del topic y periodo y conserva el informe anterior mientras trabaja. No llamar a IA por montar, hacer scroll, cambiar pestaña o actualizar contadores. Doble clic converge en una ejecución; mostrar error recuperable y consumo si el producto ya lo ofrece.

Contrato conceptual: `topicId`, `period`, `sourceSnapshotHash`, `generatedAt`, `provider/model/promptVersion` solo en servidor o detalle autorizado, `summary`, `findings[]`, `opportunities[]`, `coverage`, `citations[]`. Validar estructura y pertenencia de IDs citados; rechazar citas inventadas. Una validación de IDs no demuestra respaldo semántico: incluir revisión de fundamentación antes de mostrar como informe final. Contenido de fuentes y salida de IA son datos no confiables; no aceptar HTML arbitrario ni instrucciones incrustadas.

Conservar versiones y marcar informe desactualizado si cambió el snapshot; no sustituirlo en silencio. Si el informe corresponde a otro periodo, mostrarlo con su periodo original o indicar que no existe uno para el seleccionado, nunca relabelarlo. Elegir persistencia en OVW-08 tras revisar abstracciones existentes; esta propuesta no obliga a crear una migración.

### Candidatos editoriales y acciones rápidas

`TopicEditorialCandidates` se alimenta de la shortlist/evaluación existente del topic, no de otro ranking generado al abrir la página. Seleccionar hasta cinco historias elegibles sin rechazo ni duplicado confirmado, con evaluación vigente cuando existe; ordenar por puntuación descendente y desempatar por fecha e ID. OVW-01 valida la semántica del score existente y registra la regla exacta. Sin evaluación vigente: etiqueta «Sin evaluar» o «Evaluación desactualizada», nunca score cero ni prioridad inventada. No traducir score en High/Medium/Low sin umbrales documentados de la política real.

Fila en escritorio: miniatura a la izquierda, título de hasta tres líneas, fuente y antigüedad, badge de evaluación y botón Revisar a la derecha. Imagen solo si existe un recurso autorizado; placeholder neutro en otro caso. En móvil botón debajo del texto, título accesible completo y sin scroll horizontal. Distinguir miniatura de fuente de asset creativo aprobado. Ver todos abre el mismo conjunto ordenado, no la lista general sin filtros.

`TopicQuickActions` muestra hasta cuatro acciones: abrir recolección, revisar pendientes/continuar draft, abrir estudio y añadir fuente. Cada una declara su efecto. Abrir estudio no genera imágenes; abrir recolección no inicia una ejecución. Ver calendario aparece cuando PUB-05 está disponible. El botón de creación en publicación abre selección/revisión del contenido, no envía un post. Navegación y ejecución mantienen semánticas distintas y acciones sensibles conservan sus autorizaciones existentes.

### Necesita tu atención

Prioridad propuesta: (1) publicación incierta o registro local pendiente tras éxito remoto; (2) fallos seguros de entrega o autorización necesaria para trabajos activos; (3) drafts con blockers; (4) revisiones pendientes de aprobación. Dentro de cada grupo: más antiguo primero y desempate estable por ID. Los avisos editoriales no bloqueantes no se convierten en urgencias.

Fila: icono y etiqueta de severidad, título de pieza, tipo/versión, motivo principal en lenguaje claro, cantidad de motivos adicionales, antigüedad y acción. Ejemplo ilustrativo: «Newcomer Survey · Draft v3 · Falta evidencia en una slide · Revisar draft». No usar nombres de campos como `ctaQuestion` como explicación principal para el editor.

Reintentar abre el detalle que decide si el fallo admite reintento. Un resultado incierto debe abrir reconciliación y nunca ofrecer publicación ciega. Al resolver un elemento se actualiza su sección y contadores; preservar foco y anunciar el cambio.

### Producción y accesos rápidos

Etapas: historias seleccionadas, briefs disponibles, drafts en revisión, imágenes por revisar y paquetes listos/publicados. OVW-01 debe mapear estados reales antes de implementar; no derivar «listo para publicar» solo de un draft aprobado. Usar el evaluador vigente de capacidades y vigencia sin llamadas externas por cada tarjeta.

Las piezas continuables muestran miniatura cuando existe, título, formato, última revisión y siguiente paso. Se priorizan tareas con acción disponible; las bloqueadas remiten a la cola de atención. Ejemplos: Revisar 3 drafts, Continuar carrusel, Revisar imágenes. Las cantidades provienen de la misma consulta que el listado de destino.

El enlace interno conserva `topicId`, entidad, filtro y periodo cuando aplica. El contrato de navegación puede usar estado o URL según la arquitectura existente; enlaces compartibles no contienen secretos. Si el elemento fue eliminado o cambió de tema, explicar el estado y volver a una lista válida.

### Publicaciones, salud y actividad

Entregas: miniatura de la versión enviada, plataforma/cuenta, estado y fecha real o programada; enlace remoto solo si existe. Una entrega confirmada sin permalink no se representa como fallida. La agenda se integra con PUB-05; hasta entonces no se muestran horarios ficticios ni un botón funcional de programar.

Salud: mostrar última recolección conocida y su resultado; fuentes activas y fallidas; estado de conexión y capacidades conocidas. Diferenciar conexión de permiso para publicar y permiso para insights. «Sin señal de actividad del worker» no significa «worker detenido». Un botón abre la configuración existente; Overview no renueva tokens ni lanza recolección automáticamente.

Actividad: reutilizar eventos persistidos cuando existan. Si solo hay timestamps de entidades, llamarlos «Actualizaciones recientes», no inventar autor, aprobación o historial. No construir una tabla de auditoría nueva sin identificar primero la necesidad. Registrar vínculos concretos, ordenar por fecha y deduplicar por identidad de evento.

### Resultados

Mostrar exclusivamente métricas que ya se almacenan y para las que hay capacidad concedida. Cada tarjeta declara unidad, periodo aplicable, fecha de captura, plataforma y número de publicaciones con datos respecto al total elegible. No sumar alcance único entre posts o plataformas como si fueran personas distintas; no mostrar variaciones porcentuales sin periodos comparables.

Si solo hay métricas acumuladas actuales de posts publicados en el periodo, etiquetarlas así; no llamarlas actividad ocurrida durante el periodo. Faltante no es cero. Facebook permanece no disponible hasta tener integración y métricas reales; la agenda depende de programación durable. Enlazar [rendimiento de Instagram](instagram-performance.md) y [publicación](instagram-publishing.md), sin duplicar sus historias.

## Lenguaje visual, responsive y accesibilidad

**Contrato obligatorio para OVW-01 a OVW-10:** todos los componentes nuevos o modificados deben usar UXDSL y los patrones existentes de paleta dinámica, espaciado, densities y breakpoints. Esto incluye shell, tarjetas, listas, formularios, gráficos y todos sus estados interactivos. El parecido visual con las referencias no sustituye este requisito. Cada historia contiene el contrato transversal y debe comprobarlo antes de cerrarse.

Reutilizar `density(n)` prioritariamente y `space(n)` para la escala de composición; responsive con `xs/sm/md/lg/xl`; tipografía, superficies, botones e inputs mediante sus primitivas `@ds-*`; bordes, radios y sombras mediante tokens. No crear escalas, breakpoints o paletas paralelos. Las medidas funcionales sin equivalente en tokens siguen permitidas cuando no sustituyan una escala de diseño existente.

Usar UXDSL y la paleta dinámica del topic activo. Reutilizar el mecanismo de tematización existente, sin crear otro proveedor de tema ni fijar verde, azul o cualquier otro color. Títulos y acciones usan tokens semánticos como `palette(primary-main)` resueltos por el tema; superficies, texto, bordes, sombras e iconos siguen sus tokens correspondientes. La semántica de advertencia/error conserva los tokens existentes. Verificar la configuración efectiva antes de usar nombres nuevos; no codificar colores hex.

- Contenedor fluido, márgenes consistentes y lectura confortable; en `lg` candidatos/columna operativa en proporción 2:1, con columnas `minmax(0, ...)` para evitar overflow.
- `xs` una columna; `sm` contadores 2×2; `md` contadores en cuatro columnas si caben; `lg` composición principal de dos columnas; `xl` conserva jerarquía sin estirar párrafos indefinidamente. Breakpoints existentes: 0/640/768/1024/1280.
- Usar `density(n)` para separación y padding, `radius(n)`, `shadow(n)`, `border(...)`, `@ds-surface`, `@ds-typo`, `@ds-button` y `@ds-input`. No agregar CSS global para esta feature; migrar solo superficies tocadas.
- Títulos de sección claros; valores destacados y etiquetas pequeñas legibles. Miniaturas consistentes en 4:5 para feed sin deformar originales; placeholders discretos cuando no existen assets.
- Sombras suaves y separación por superficie; evitar tarjetas dentro de tarjetas innecesarias. Sin animaciones decorativas que distraigan de las tareas.
- Estructura semántica con un título de Overview y encabezados de sección. Enlaces para navegar, botones para ejecutar. No envolver una tarjeta con múltiples controles dentro de un botón.
- Foco visible, navegación completa por teclado, estados anunciados sin leer toda la pantalla y texto que complemente cada color/icono. Respetar movimiento reducido.
- Al cambiar de topic, actualizar también la paleta usando el flujo existente, sin conservar acentos del anterior. Validar contraste, foco, gráficos y estados con al menos dos temáticas de paletas distintas; no depender solo del color para comunicar estado.
- Skeletons con altura estable; no parpadeos al revalidar. Comprobar textos largos, zoom 200%, pantallas pequeñas y contraste de los tokens usados.

## Estados compartidos

| Estado | Presentación | Acción |
|---|---|---|
| Sin topic | Explicación y selector/crear topic según permisos | Seleccionar contexto |
| Cargando | Skeleton por sección, sin cifras antiguas de otro topic | Ninguna operación dependiente |
| Topic vacío | Explicación breve y siguiente paso real | Configurar fuentes o abrir recolección |
| Sin pendientes | Mensaje tranquilo, sin alerta de éxito sobredimensionada | Continuar producción |
| Error parcial | Error localizado; conservar secciones sanas | Reintentar lectura afectada |
| Datos antiguos | Fecha de origen visible y etiqueta de antigüedad | Actualizar datos o abrir sync explícito |
| Sin permiso/capacidad | Motivo claro, sin cifra inventada | Abrir configuración si autorizado |
| Informe no generado | Resumen operativo disponible y explicación del informe | Generar informe explícitamente |
| Informe en proceso/fallido | Mantener anterior identificado; progreso/error | Reintento acotado |

## Datos, seguridad y rendimiento

Proponer un servicio/repository de agregación del topic y una ruta autenticada siguiendo las convenciones actuales, con un DTO tipado: contexto/periodo, contadores, atención, producción, publicaciones, salud, actividad, capacidades y frescura por sección. Los nombres/ruta exactos se deciden en OVW-01; leer la documentación local de Next antes de implementar APIs.

Autorizar el topic en servidor antes de consultar. Reutilizar repositorios de historias, drafts, assets, entregas y métricas. Aplicar filtros en SQL/agregación de servidor; no descargar todo el contenido o assets al cliente para contarlos. Listas acotadas con total real y paginación en destinos. Evitar N+1 por pieza. No exponer tokens, URLs secretas de entrega, claves R2, prompts completos ni errores crudos.

Cada sección devuelve estado/frescura explícitos. Abort/cancel y verificación de topic/periodo antes de aplicar respuestas impiden mezclar temas tras navegación rápida. Cualquier caché debe incluir el contexto de autorización, topic y periodo; invalidación tras acciones locales relevantes. Un error de contador no se convierte en cero.

Abrir Overview solo lee datos propios y el informe guardado. Sin llamadas de IA, Meta, fal o recolección por montaje. No añadir polling rápido global; aprovechar invalidaciones existentes y actualización manual. Medir con topic grande y documentar número de consultas y latencia antes/después; fijar presupuesto realista en OVW-01 según hosting y datos medidos.

## Criterios de entrega transversales

- Cada contador coincide con su lista de destino y declara si cuenta historias, revisiones o entregas.
- Todas las acciones rápidas abren el topic y entidad correctos, también después de volver atrás y cambiar de topic.
- No confundir revisión aprobada con publicación autorizada; conservar guardas existentes.
- No presentar capacidades futuras como funcionales ni datos faltantes como cero.
- Fase 1 útil sin IA, métricas o Facebook conectados. Fase 2 cita evidencia y conserva versiones del informe.
- Validar estados vacíos, errores parciales, respuesta fuera de orden, permisos y accesibilidad; pruebas relevantes, lint y build. `db:check` solo si hay cambios de esquema/migración.
- QA visual en móvil, tablet y escritorio con datos realistas, títulos largos y múltiples pendientes. No se publican posts ni se ejecutan generaciones pagadas para validar el layout.

## Historias de implementación

- [OVW-01 — Definir agregados y contrato de datos del topic](../stories/OVW-01.md) · P0.
- [OVW-02 — Construir cabecera, estructura responsive y estados comunes](../stories/OVW-02.md) · P0.
- [OVW-03 — Priorizar pendientes y accesos para resolverlos](../stories/OVW-03.md) · P0.
- [OVW-04 — Mostrar producción y continuar piezas en contexto](../stories/OVW-04.md) · P0.
- [OVW-05 — Resumir publicaciones y capacidades operativas](../stories/OVW-05.md) · P0.
- [OVW-06 — Añadir actividad reciente y navegación compartida](../stories/OVW-06.md) · P0.
- [OVW-07 — Integrar el Overview operativo y resumen sin IA](../stories/OVW-07.md) · P0.
- [OVW-08 — Generar y conservar el informe editorial fundamentado](../stories/OVW-08.md) · P1.
- [OVW-09 — Integrar resultados y agenda según capacidades disponibles](../stories/OVW-09.md) · P1.
- [OVW-10 — Validar Overview de extremo a extremo y accesibilidad](../stories/OVW-10.md) · P0.
