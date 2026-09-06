# Feature: Instagram conectado al rendimiento editorial

**ID:** FEAT-IG-001  
**Estado:** Propuesta lista para desglosar e implementar  
**Producto:** Press Craftor

## Objetivo

Permitir que el equipo visualice las publicaciones de la cuenta de Instagram de cada tema, las vincule con sus historias editoriales y versiones creativas, y mida sus resultados para orientar futuras decisiones de contenido.

El primer resultado esperado es poder abrir una historia y responder: **qué publicamos, qué versión utilizamos y cómo está funcionando**.

## Punto de partida

- Existe una conexión de Instagram por tema, con credenciales cifradas en el servidor.
- El cliente de Meta implementa autenticación y consulta del nombre de usuario.
- OAuth solicita permisos básicos y de publicación; falta incorporar el acceso a insights.
- `story_social_publications` guarda estado, fechas y URL con una restricción de un registro por tema, historia y plataforma.
- Aún no existen importación de publicaciones, capturas históricas de métricas ni vínculos con versiones creativas.

## Entregas

| Entrega | Resultado | Historias |
|---|---|---|
| MVP | Ver posts, vincular historias y consultar métricas actuales | IG-01 a IG-06 |
| Histórico | Sincronización automática y comparación por antigüedad | IG-07 e IG-08 |
| Aprendizaje editorial | Relacionar resultados con decisiones creativas | IG-09 |

No se incluyen publicación automática, programación de contenido, respuestas a comentarios, gestión de anuncios ni cambios automáticos de prompts. Las Instagram Stories efímeras quedan para una ampliación; aquí “historia” significa la historia editorial de Press Craftor. El MVP contempla posts de imagen, carruseles y reels accesibles por la API.

## Historias de usuario

### IG-01 — Habilitar y verificar acceso a insights

**Como** administrador del tema, **quiero** conocer y completar los permisos de Instagram, **para** consultar publicaciones y métricas con una conexión válida.

**Prioridad:** P0 · **Dependencias:** ninguna.

**Criterios de aceptación**

- OAuth incorpora `instagram_business_manage_insights` y el servidor verifica las capacidades realmente concedidas.
- La interfaz distingue cuenta desconectada, conectada sin insights, operativa y pendiente de reconexión.
- Una cuenta existente puede autorizar el permiso adicional mediante reconexión.
- Se comprueba la versión de API y la disponibilidad de los permisos para el modo de acceso de la aplicación antes de considerar habilitada la función.
- Se gestiona la renovación del token cuando sea posible y se solicita reconexión cuando expire o se revoque.
- Tokens y secretos permanecen en el servidor y no aparecen en respuestas al navegador ni logs.
- Reconectar la misma cuenta conserva el historial. Conectar otra cuenta no mezcla sus publicaciones ni sus métricas con las anteriores.

### IG-02 — Importar publicaciones de la cuenta conectada

**Como** editor, **quiero** sincronizar las publicaciones existentes, **para** trabajar desde Press Craftor aunque se hayan publicado directamente en Instagram.

**Prioridad:** P0 · **Dependencias:** IG-01.

**Criterios de aceptación**

- El botón “Sincronizar” importa las publicaciones recientes y permite continuar cargando mediante paginación.
- Cada publicación conserva cuenta de origen, ID externo, permalink, texto, tipo y fecha de publicación, además de los recursos visuales disponibles.
- Un carrusel se representa como una publicación con sus elementos, no como varias publicaciones independientes.
- Repetir o solapar sincronizaciones no genera duplicados.
- Los posts importados no crean historias editoriales ni aprobaciones automáticamente.
- Un fallo parcial conserva lo ya importado y muestra el resultado de la sincronización.
- La ausencia de un post en una página de resultados no se interpreta como eliminación; un recurso confirmado como inaccesible conserva su historial con ese estado.

### IG-03 — Explorar la galería de Instagram

**Como** editor, **quiero** ver las publicaciones de la cuenta del tema, **para** identificar qué se publicó y qué está pendiente de vincular.

**Prioridad:** P0 · **Dependencias:** IG-02.

**Criterios de aceptación**

- La sección Instagram muestra miniatura, extracto del texto, formato, fecha, enlace externo y estado de vinculación.
- Permite filtrar por periodo, formato y publicaciones vinculadas o pendientes.
- Permite cargar más resultados sin perder filtros ni selección.
- Incluye estados de carga, cuenta sin publicaciones, error y necesidad de reconexión.
- Muestra la cuenta activa y la fecha de última sincronización exitosa.
- Si una miniatura deja de estar disponible, el post sigue siendo accesible con una alternativa visual y su enlace.
- Funciona en móvil y escritorio usando la paleta verde y los componentes y tokens UXDSL del proyecto.

### IG-04 — Vincular un post con su historia y versión creativa

**Como** editor, **quiero** asociar una publicación con su historia y, cuando la conozca, su versión creativa, **para** conservar la trazabilidad del contenido publicado.

**Prioridad:** P0 · **Dependencias:** IG-02 e IG-03.

**Criterios de aceptación**

- “Vincular con historia” permite buscar y seleccionar una historia aprobada del mismo tema.
- Una historia admite múltiples posts de Instagram. Cada post tiene como máximo una historia editorial vinculada dentro del tema en este alcance.
- Se puede seleccionar el borrador y la versión o lote de imágenes utilizados; esta información es opcional para publicaciones históricas.
- Solo se aceptan versiones pertenecientes a la historia seleccionada. Vincular una publicación no aprueba borradores ni imágenes.
- Una coincidencia única con una URL de Instagram ya registrada puede vincularse automáticamente después de normalizar el permalink y comprobar cuenta y tema.
- Una URL ambigua o conflictiva queda pendiente de selección manual. Coincidencias por texto o fecha nunca se confirman automáticamente.
- Es posible corregir o quitar el vínculo sin borrar el post ni sus métricas; se registra cuándo y quién hizo el cambio usando la identidad disponible.
- El seguimiento actual de publicaciones continúa funcionando y no pierde registros históricos.

### IG-05 — Consultar métricas actuales por publicación

**Como** editor, **quiero** consultar los resultados disponibles de un post, **para** evaluar su distribución, utilidad y capacidad de generar interacción.

**Prioridad:** P0 · **Dependencias:** IG-01 e IG-02.

**Criterios de aceptación**

- El servidor consulta las métricas compatibles con el tipo de publicación, permisos y versión de API.
- Se muestran alcance, visualizaciones, likes, comentarios, guardados y compartidos cuando estén disponibles.
- Seguimientos atribuibles y visitas al perfil por post solo aparecen si la API los ofrece para ese recurso. No se infieren del crecimiento de la cuenta.
- Se distingue entre cero real, métrica no disponible, dato pendiente y error de actualización.
- Cada resultado conserva fecha de consulta, periodo y unidad para interpretar correctamente su valor.
- Un error de una métrica no impide mostrar las demás ni borra el último valor válido.
- Se calculan guardados/alcance, compartidos/alcance y comentarios/alcance solo con datos compatibles y alcance mayor que cero.
- No se presenta una métrica de finalización o abandono por slide si Instagram no la proporciona.

### IG-06 — Ver resultados desde la historia editorial

**Como** editor, **quiero** ver las publicaciones vinculadas desde una historia, **para** revisar todo su recorrido sin buscar manualmente en Instagram.

**Prioridad:** P0 · **Dependencias:** IG-04 e IG-05.

**Criterios de aceptación**

- La historia muestra todos sus posts vinculados con formato, fecha, métricas y enlace a Instagram.
- Cada post identifica su versión creativa cuando está registrada y muestra “Versión no identificada” cuando no lo está.
- Se puede navegar entre post, historia y versión creativa histórica sin reemplazar el borrador actual.
- Sin publicaciones vinculadas, aparece una acción para buscar un post importado.
- No se suma el alcance de varios posts como si fueran personas únicas.
- Los cambios de vínculo se reflejan en ambos lados sin duplicar registros.

**Corrección de revisión (IG-06):** la consulta de versión usa el post vinculado al tema e historia y carga únicamente su lote y revisión exactos. La vista es de solo lectura dentro del panel y no cambia el borrador activo. Una revisión antigua sin snapshot disponible muestra la limitación; no se reconstruye ni sustituye por la actual. El selector de publicaciones pendientes permite paginar con deduplicación, cancelación y reintento. Los cambios de vínculo notifican a ambas vistas mediante la señal compartida del dashboard. La validación de interacción en navegador sigue pendiente.

La resolución directa de borradores incluye los documentales y verifica su pertenencia al tema y a la historia. Los resultados muestran la última consulta exitosa de métricas y los fallos globales, con advertencia sobre los valores conservados. Las regresiones de servidor y renderizado cubren estos casos.

### IG-07 — Conservar la evolución mediante sincronización automática

**Como** responsable editorial, **quiero** guardar mediciones periódicas, **para** entender cómo evolucionan las publicaciones y evitar depender de consultas manuales.

**Prioridad:** P1 · **Dependencias:** IG-05.

**Criterios de aceptación**

- Un trabajo programado actualiza publicaciones y métricas con una frecuencia configurable y mayor atención a posts recientes.
- Las mediciones se almacenan como capturas con timestamp, sin sobrescribir el histórico.
- El proceso evita trabajos duplicados, respeta límites de la API y reintenta errores transitorios con espera progresiva.
- Los errores de permisos o token requieren la acción correspondiente, no reintentos indefinidos.
- Se mantienen última ejecución exitosa, estado y resumen de errores por cuenta.
- Se recopilan mediciones cercanas a 24 horas, 72 horas y siete días, indicando su edad real y la tolerancia aplicada.
- Para posts antiguos se almacena lo recuperable desde su importación; no se reconstruyen capturas pasadas a partir del total actual.

### IG-08 — Comparar rendimiento de publicaciones equivalentes

**Como** responsable editorial, **quiero** comparar posts en condiciones similares, **para** identificar resultados destacados sin favorecer publicaciones más antiguas.

**Prioridad:** P1 · **Dependencias:** IG-06 e IG-07.

**Criterios de aceptación**

- El panel permite comparar publicaciones de la misma cuenta, formato y ventana de antigüedad.
- Muestra valores absolutos, tasas y diferencia frente a la mediana del grupo comparable.
- Explicita el tamaño de muestra y señala grupos con datos insuficientes.
- Las métricas ausentes no entran como ceros en medianas o rankings.
- Las capturas fuera de la tolerancia temporal se excluyen o identifican expresamente; no se comparan como si fueran de la misma edad.
- Se puede distinguir contenido promocionado cuando exista información fiable; cuando no, se indica que esa separación no está disponible.
- El crecimiento global de seguidores se presenta como dato de cuenta, separado de la atribución por publicación.

### IG-09 — Conectar resultados con decisiones creativas

**Como** estratega editorial, **quiero** relacionar rendimiento con hooks, formatos y cierres utilizados, **para** decidir qué probar en futuras publicaciones.

**Prioridad:** P2 · **Dependencias:** IG-08 y suficientes posts con versiones identificadas.

**Criterios de aceptación**

- El análisis utiliza la versión creativa publicada o explícitamente identificada, no el borrador más reciente.
- Permite explorar hook, enfoque, tema, cantidad de slides, objetivo de conversión, CTA y evaluación editorial previa.
- Cada observación muestra publicaciones de ejemplo, ventana temporal, métrica y tamaño de muestra.
- Los posts sin versión identificada permanecen en analítica general, pero no se atribuyen a decisiones creativas desconocidas.
- Las recomendaciones distinguen asociaciones observadas de efectos causales y proponen experimentos verificables.
- La puntuación editorial de la IA y el rendimiento medido son valores separados; no se presenta ninguno como garantía de viralidad.
- Ningún resultado modifica automáticamente prompts, perfiles o aprobaciones.

## Diseño técnico propuesto

- Extender los servicios en `src/app/modules/meta`; todas las llamadas a Instagram se realizan en el servidor mediante rutas autenticadas y acotadas al tema.
- Añadir persistencia para identidad de cuenta, publicaciones externas, vínculos editoriales y capturas de métricas. La identidad externa debe permanecer estable aunque cambie el username o se reconecte el tema.
- Mantener `story_social_publications` como seguimiento editorial existente. Incorporar la relación con posts individuales sin eliminar su historia ni su restricción actual de forma destructiva.
- Usar los IDs/versiones de borradores y assets existentes para trazabilidad; no duplicar el modelo de versiones creativas.
- Definir antes de la migración las claves únicas para importación y capturas, los índices por cuenta/tema/fecha y el comportamiento al desconectar o cambiar de cuenta.
- Guardar el nombre de la métrica, su periodo, unidad y versión de API junto al valor. Distinguir valor ausente de cero y evitar mezclar definiciones incompatibles.
- La lista usa datos persistidos; la sincronización actualiza esos datos sin hacer depender cada renderizado de Instagram.
- Incorporar programación en el mecanismo de trabajos del despliegue, con autenticación, bloqueo de concurrencia y trazabilidad.

## Orden de implementación

1. IG-01 y diseño de persistencia, verificando capacidades con la cuenta conectada.
2. IG-02, IG-03 e IG-04: publicaciones visibles y vinculables.
3. IG-05 e IG-06: cerrar el MVP con métricas y trazabilidad desde cada historia.
4. IG-07 e IG-08: construir histórico y comparaciones.
5. IG-09: incorporar aprendizaje cuando exista una muestra suficiente.

## Definición de terminado del MVP

- Una cuenta existente puede habilitar insights y sincronizar posts.
- El editor puede ver un carrusel o reel, vincularlo a una historia y consultar sus métricas desde ella.
- Una historia puede tener varios posts sin pérdida del seguimiento existente.
- Una segunda sincronización no duplica publicaciones y un fallo de API no borra resultados previos.
- Se comprueba aislamiento entre temas, reconexión de cuenta, permisos incompletos, paginación, métricas ausentes y conflictos de vinculación.
- Las pruebas usan respuestas controladas de la API; se hace además una verificación real de lectura con la cuenta conectada.
- Pasan `npm test`, `npm run lint`, `npm run build` y `npm run db:check` para los cambios de esquema. Cualquier bloqueo del entorno se documenta expresamente.
- La interfaz conserva el sistema visual UXDSL y las aprobaciones humanas del flujo creativo.

## Referencias

- [Insights de Instagram, colección oficial de Meta](https://www.postman.com/meta/instagram/folder/23987686-f659d7d1-d74c-44e4-9192-9b1e8694c511).
- [API de Instagram y métricas por publicación, Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-1ff01566-3509-48bd-a0f4-8571a91ccfdf).

Las métricas y permisos concretos se verifican contra la versión de API elegida durante IG-01 e IG-05; no se asume disponibilidad uniforme entre formatos.

## Historias (Foam)
<!-- foam-stories -->

[[BASE-01]] · [[BASE-02]] · [[BASE-03]] · [[BASE-04]] · [[IG-01]] · [[IG-02]] · [[IG-03]] · [[IG-04]] · [[IG-05]] · [[IG-06]] · [[IG-07]] · [[IG-08]] · [[IG-09]]
