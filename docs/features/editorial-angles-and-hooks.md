# Feature: Ángulos editoriales y hooks de adquisición

**ID:** FEAT-ANGLE-001  
**Estado:** Planificado — P0  
**Tablero:** [editorial-angles-and-hooks.kanban.md](editorial-angles-and-hooks.kanban.md)  
**Relación:** [Hooks claros con selección editorial verificable](editorial-hook-selection.md), [Daily editorial planner](daily-editorial-planner.md), [Instagram performance](instagram-performance.md)

## Problema

Los drafts actuales pueden ser correctos, claros y visualmente atractivos, pero todavía pueden abrir como titulares de industria: anuncian quién dijo algo antes de explicar qué cambió, por qué es inesperado o por qué debería importarle a una persona fuera de la burbuja AI.

La mejora debe hacer que el draft elija el mejor ángulo respaldado por la noticia y que el hook convierta ese ángulo en una promesa concreta. No se debe fabricar una consecuencia personal cuando la fuente no la demuestra.

## Resultado esperado

Cada brief nuevo conserva el `Editorial Priority` y el `Growth Score`, pero además guarda un ángulo de adquisición seleccionado desde el vocabulario configurado para su topic.

Los cinco ángulos que motivan esta feature son el vocabulario inicial de la marca Tech:

- `everyday-impact` — herramientas, empleo, dinero, educación y privacidad que cambian algo para la audiencia;
- `wtf-capability` — capacidades nuevas o comportamientos inesperados;
- `power-shift` — reemplazos, despidos, control corporativo o cambios de poder;
- `risk-explainer` — fraude, seguridad, regulación y riesgos comprensibles;
- `industry-deep-dive` — agents, arquitectura, research y policy para una audiencia más especializada.

Estos valores no se convierten en un enum global. Cada topic/brand tendrá una lista de lentes con una clave estable, etiqueta, definición, ejemplos y objetivo de cartera. Un topic municipal, culinario o de psicología podrá usar otro vocabulario sin que el código conozca su industria.

La cuota es configurable por topic y solo orienta la cartera. Para Tech puede ser 40/20/15/15/10; para otro topic puede ser distinta:

| Configuración | Propósito |
| --- | --- |
| `key` | Identificador estable del lente dentro del topic |
| `label` | Nombre legible para el editor |
| `definition` | Qué tipo de historia cubre |
| `hookBias` | Preferencia agnóstica para construir el hook: `capability`, `stake`, `contrast` u omitida para selección automática |
| `targetShare` | Preferencia de cartera, opcional |
| `enabled` | Permite retirar un lente sin romper históricos |

Para una historia individual, la evidencia y la claridad tienen prioridad sobre la cuota. El planner debe poder devolver “sin ángulo fuerte” o recomendar otra historia.

## Decisiones de diseño

- `GeneratedCreativeBrief.angle: string` ya existe, es texto libre, `notNull`, lo consume el fact guard y se inyecta en prompts. Es load-bearing y no se reutiliza para esta feature.
- `editorialAngle` es un concepto distinto: una decisión estructurada de adquisición perteneciente al vocabulario del topic. La forma propuesta es una columna nullable `editorial_angle` `jsonb` en `story_creative_briefs`, con `{ angle, taxonomyVersion, reason, audienceStake, hookPromise, alternative? }`; `angle` aquí es una clave opaca del vocabulario del topic, no el campo textual existente.
- `alternative`, cuando existe, es un único objeto `{ angle, reason }` con otra clave habilitada del mismo snapshot. No es otro hook, no tiene facts propios y puede omitirse cuando no hay una segunda lectura sustentada.
- `framingStrategy` continúa describiendo cómo se escribe (`reader-consequence`, `explainer`, `authority` o `auto`). `angle`, `editorialAngle` y `framingStrategy` no se mezclan.
- La taxonomía vive en una tabla propia del topic, no en `topic_editorial_profiles` ni en una condición del código para Tech. La opción propuesta es `topic_acquisition_lenses`, con snapshots append-only por scope + `taxonomyVersion` y un JSONB de lentes. Así no se altera `isDefault` ni `useLegacySourceFallback`.
- Decisión de alcance v1: el vocabulario es topic-level. Las líneas editoriales del mismo topic comparten taxonomía de adquisición, aunque puedan tener audiencias, criterios y formatos distintos. Esto es intencional y evita atribuir al topic una taxonomía de una línea concreta.
- La tabla incluye `line_id` nullable desde la primera migración. En v1 solo se leen snapshots con `line_id = NULL`; el campo queda reservado para overrides por línea futuros sin cambiar el esquema. La resolución por línea no forma parte de esta entrega.
- El brief es la clasificación autoritativa porque dispone del artículo y los hechos completos. El planner solo puede clasificar provisionalmente porque corre antes del brief.
- La taxonomía queda fuera de `createBriefInputHash` a propósito. Un cambio de labels, definición o cuota no regenera automáticamente briefs ni altera `inputHash` históricos; `taxonomyVersion` dentro de cada decisión registra con qué vocabulario se clasificó.
- La UI debe aceptar que una decisión histórica use una lente desactivada o retirada del vocabulario vigente y mostrarla como histórica, sin fallar validación ni intentar repararla silenciosamente.
- El sistema conserva la selección actual de tres hooks, sus hechos, checks y unidad de respuesta. Esta feature amplía la decisión; no crea una segunda llamada fija solo para generar hooks.
- El hook seleccionado debe revelar el sujeto y la acción, introducir una consecuencia, contraste, sorpresa o capacidad concreta y prometer una respuesta que exista en el carrusel.
- “¿Por qué me afecta?” solo se usa si los hechos respaldan algo que la audiencia usa, paga, decide, aprende o puede sufrir. Si no, se usa lenguaje de utilidad general o explicación.
- El modelo puede seleccionar un hook sobrio para una noticia útil. No se exige miedo, indignación, segunda persona ni tensión artificial.
- Los ángulos, razones y hooks son metadatos editoriales. No aparecen en la imagen salvo el texto aprobado del draft.
- Los drafts y revisiones históricas no se reescriben en segundo plano.

## Flujo

1. El planner recibe la taxonomía del topic, las publicaciones recientes y los candidatos evaluados.
2. En su propia llamada existente, el planner asigna un ángulo provisional a la recomendación y a sus alternativas. Este valor sirve para diversificar la cartera y orientar la preparación; no se trata como evidencia ni como clasificación final.
3. El brief analiza el artículo y los hechos completos y clasifica la historia en un ángulo autoritativo del vocabulario vigente.
4. El brief explica qué audiencia puede encontrarla relevante y cuál es la promesa de lectura.
5. La generación produce tres aperturas distintas: capacidad/sorpresa, consecuencia/utility y tensión/contraste cuando estén respaldadas.
6. La selección existente valida claridad, respaldo, lenguaje humano, consecuencia y curiosidad.
7. El editor puede revisar ángulo, razón, candidatos y selección antes de aprobar el draft.

## Tareas

### ANGLE-01 — Definir el contrato de ángulos

**Prioridad:** P0 · **Dependencias:** ninguna

- No añadir un enum global con valores propios de Tech. Añadir un contrato para una taxonomía configurable por topic: claves estables, labels, definición, ejemplos, `hookBias` opcional, `targetShare` y `enabled`.
- Distinguir explícitamente `angle` textual existente, `editorialAngle` estructurado nuevo y `framingStrategy`.
- Definir el comportamiento de compatibilidad para briefs históricos sin ángulo.
- Añadir `editorial_angle` nullable `jsonb` a `story_creative_briefs`, con validación de forma en servidor y sin exigir valor a filas históricas. El objeto usa la propiedad `angle` como clave opaca del topic.
- Crear la tabla propia `topic_acquisition_lenses` como configuración append-only por topic y versión, con el conjunto JSONB de lentes, `line_id` nullable reservado para overrides futuros, timestamp y restricciones de pertenencia/versión.
- Resolver explícitamente topics existentes sin perfil de evaluación: crear/seedear un vocabulario apropiado en la tabla propia o usar un default genérico neutral; nunca crear una fila de `topic_editorial_profiles` solo para colgar la taxonomía ni heredar silenciosamente las cinco lentes de Tech.
- Incrementar `taxonomyVersion` al publicar una nueva taxonomía, sin tocar `profile_version`, `isDefault` ni el comportamiento legacy de evaluación.
- Mantener `Growth Score` como estimación de adquisición, sin convertirlo en una predicción de viralidad.
- Documentar que la cuota configurada se aplica al conjunto de publicaciones y no obliga a una historia concreta.
- Preparar una migración aditiva para `topic_acquisition_lenses` y `story_creative_briefs.editorial_angle`; no rellenar ni reescribir briefs históricos.

### ANGLE-02 — Clasificar la noticia a partir de evidencia

**Prioridad:** P0 · **Dependencias:** ANGLE-01

- Actualizar el contrato del brief para devolver el objeto `editorialAngle` con clave válida para el topic, versión de taxonomía, razón, stake y promesa.
- Exigir que la razón cite únicamente los hechos disponibles y preserve sus calificadores.
- Implementar fallback al lente explicativo equivalente configurado por el topic cuando no exista una consecuencia personal sustentada.
- Impedir que palabras como “podría”, “reportado” o “estimado” se conviertan en certeza para mejorar el hook.
- No cambiar el campo existente `angle` ni retirar su uso del fact guard o de los prompts.
- Bump explícito de `briefPromptVersion` (por ejemplo, v32 → v33) y documentación del coste de proveedor al regenerar briefs activos; no ejecutar una regeneración masiva como parte de la migración.
- La taxonomía no se añade a `createBriefInputHash`: un cambio de taxonomía por sí solo no invalida el cache. Una generación realmente nueva, por cambio de story/profile/prompt o acción explícita de regeneración, debe cargar la taxonomía vigente y guardar su `taxonomyVersion`.

### ANGLE-03 — Mejorar la generación y selección del hook

**Prioridad:** P0 · **Dependencias:** ANGLE-02 · [HOOK-02/03](editorial-hook-selection.md)

- Mantener tres candidatos distintos y asociar cada uno con sus hechos permitidos.
- Pedir una alternativa con el `hookBias` configurado para la lente seleccionada (`capability`, `stake` o `contrast`); si el bias está omitido, usar la selección automática existente.
- No mencionar claves, labels ni ejemplos de Tech en el prompt común. Las instrucciones se construyen desde la definición y el `hookBias` del lente activo.
- Permitir una alternativa de otro lente solo si su clave está habilitada y su definición está respaldada por los hechos.
- Priorizar consecuencia o capacidad sobre el nombre de una organización y sobre verbos de anuncio genéricos.
- Conservar el requisito de claridad y evidencia y el mínimo de cuatro checks verdaderos.
- Invalidar el hook si promete una respuesta que ninguna unidad posterior entrega.

### ANGLE-04 — Asignar ángulos provisionales en la recomendación diaria

**Prioridad:** P0 · **Dependencias:** ANGLE-01, ANGLE-02

- Incorporar la taxonomía del topic y la distribución reciente al contexto seguro del daily planner.
- Hacer que la llamada existente devuelva un ángulo provisional junto a cada recomendación y alternativa.
- Extender `PlannerChoice` con `angle` y validar la clave contra la taxonomía recibida. `taxonomyVersion` pertenece al resultado completo del plan, no a cada choice.
- Extender `DailyPlan`/su schema con `taxonomyVersion` a nivel de plan y validar que corresponde a la taxonomía enviada en esa ejecución.
- Añadir al `PlannerContext` un bloque separado `angleDistribution` con `windowSize: 30`, `knownPublicationCount` y conteos por lente. No reutilizar `recentPublications` como si fuera también la ventana estadística.
- Favorecer lentes subrepresentados solo después de considerar prioridad editorial, vigencia, evidencia y audience fit.
- Marcar el ángulo del planner como provisional y reemplazarlo por el ángulo autoritativo al crear el brief.
- Mostrar en la recomendación el ángulo elegido, su razón y la incertidumbre.
- No tratar el historial de publicaciones como evidencia de rendimiento.
- Mantener la opción explícita de “no hay candidato suficientemente fuerte”.
- Subir `PLANNER_PROMPT_VERSION` de `daily-planner-v2` a `daily-planner-v3`; el cambio de schema e instrucción no debe reutilizar planes cacheados sin ángulo.
- Mantener dos ventanas: las últimas 10 publicaciones confirmadas para repetición narrativa y hasta 30 publicaciones confirmadas con lente conocida para distribución de cartera.
- No aplicar `targetShare` como cuota cuando hay menos de 20 publicaciones con lente conocida; entre 20 y 29 usarlo solo como tie-breaker débil y con `sampleSize` visible; con 30 usarlo como preferencia, nunca como requisito.
- Excluir publicaciones históricas sin lente del denominador y mostrar el tamaño real de muestra.

### ANGLE-05 — Mostrar la decisión editorial en el draft

**Prioridad:** P0 · **Dependencias:** ANGLE-02, ANGLE-03, ANGLE-04, ANGLE-07

- Mostrar el ángulo autoritativo del brief, el ángulo provisional del planner cuando exista, stake, promesa, hook elegido y alternativas en revisión.
- Mantener candidatos fuera del copy exportado y de la generación de imágenes.
- Marcar la evaluación como obsoleta cuando cambien hechos, brief, perfil o texto del draft.
- No aplicar una alternativa automáticamente.

### ANGLE-07 — Autoría y publicación de taxonomías

**Prioridad:** P0 · **Dependencias:** ANGLE-01

- Crear endpoints autenticados para leer la taxonomía vigente y publicar una nueva versión append-only.
- Crear una pantalla mínima de configuración dentro del topic, no dentro del perfil editorial que controla `isDefault`.
- Permitir añadir, renombrar, describir, ordenar, habilitar/deshabilitar y ajustar `targetShare` de lentes.
- Permitir elegir `hookBias` opcional (`capability`, `stake`, `contrast`) y validar que la clave sea estable y no duplicada.
- Publicar de forma atómica una nueva `taxonomyVersion`; nunca editar una versión ya utilizada por briefs o planes.
- Mantener `line_id = NULL` en la UI v1 y dejar explícito que los overrides por línea están reservados.
- Validar suma, rango y ausencia de targets según la política elegida; no forzar cuotas si el topic no las configura.
- Mostrar advertencia de impacto: la nueva taxonomía afecta generaciones futuras y planes nuevos, pero no regenera briefs ni altera evaluaciones existentes.
- Proteger concurrencia con `taxonomyVersion` esperada para evitar que una edición sobrescriba otra.

### ANGLE-06 — Verificación automatizada y QA editorial

**Prioridad:** P0 · **Dependencias:** ANGLE-01 a ANGLE-05, ANGLE-07

- Añadir pruebas unitarias de taxonomía por topic, parsing, fallback, clasificación y selección.
- Añadir pruebas de integración con respuestas de Gemini simuladas y fallback de proveedor existente.
- Añadir regresiones para drafts históricos, revisiones, hechos no permitidos, pérdida de calificadores y preservación del campo textual `angle`.
- Añadir pruebas del planner antes del brief: provisional válido, clave inexistente, topic municipal/no-Tech, discrepancia entre provisional y autoritativo y `taxonomyVersion` único a nivel de plan.
- Añadir pruebas de ventanas: repetición usa 10 publicaciones, distribución usa hasta 30, publicaciones sin lente no entran al denominador y `targetShare` queda inactivo por debajo de 20 casos conocidos.
- Añadir pruebas de autoría: permisos, claves duplicadas, `hookBias` inválido, publicación append-only, incremento de versión, concurrencia y `line_id` reservado.
- Preparar una muestra manual multi-topic, no solo de Tech, con al menos dos historias por vocabulario configurado.

## Pruebas obligatorias para cerrar la feature

Estas pruebas deben pasar antes de marcar una tarea como hecha:

- Una taxonomía válida puede cargarse para dos topics con claves y definiciones distintas.
- Un brief válido devuelve exactamente una clave permitida por el vocabulario de su topic.
- Una clave desactivada o desconocida no puede aparecer en una generación nueva del brief; un cache hit histórico con esa clave debe seguir cargando y marcarse como retirada en la UI.
- Una `alternative` ausente es válida; cuando existe, usa otra clave habilitada del mismo snapshot y exige una razón no vacía.
- Una noticia sin consecuencia personal demostrada no puede recibir el lente de impacto cotidiano solo porque el prompt lo solicite.
- Una capacidad nueva respaldada puede recibir el lente equivalente a `wtf-capability` y producir un hook de capacidad concreto.
- El ángulo elegido no puede introducir hechos, causalidad, disponibilidad futura o certeza ausentes de la fuente.
- Los tres candidatos son distintos, usan hechos permitidos y el seleccionado coincide exactamente con la portada.
- Un hook con claridad falsa, evidencia falsa o menos de cuatro checks no se acepta automáticamente.
- El hook no puede prometer una respuesta que no exista en una unidad posterior.
- La recomendación diaria puede asignar un ángulo provisional sin mutar `Editorial Priority`, `Growth Score` ni decisiones previas.
- Un provisional válido puede ser reemplazado por el brief autoritativo sin perder el historial de la recomendación.
- El plan contiene una sola `taxonomyVersion`; ninguna choice puede declarar una versión diferente.
- La cuota de cartera no fuerza un ángulo cuando no hay evidencia suficiente.
- Cambiar la historia o su evaluación invalida el resultado almacenado del planner.
- Un draft histórico sin `editorialAngle` sigue cargando y no recibe una reescritura silenciosa.
- El campo textual existente `angle` conserva su valor y continúa pasando el fact guard.
- La UI permite crear una nueva taxonomía sin editar una versión append-only anterior y muestra qué briefs/planes usan lentes retiradas.
- Una edición concurrente de taxonomía falla con conflicto y no pierde la versión publicada por otro editor.
- La migración deja `editorial_angle` en `NULL` para briefs históricos, crea la tabla de lentes sin alterar `isDefault`, y no altera `inputHash`, prompt, copy ni aprobación.
- Cambiar la taxonomía no modifica `createBriefInputHash`, no regenera briefs automáticamente y deja `taxonomyVersion` como rastro de auditoría.
- Subir `PLANNER_PROMPT_VERSION` invalida planes diarios incompatibles y no modifica briefs ni evaluaciones editoriales.
- Un fallo del proveedor no convierte un draft en aprobado ni elimina su comparación histórica.

## Comandos de validación

```text
npm test
npm run lint
npm run build
```

`npm run db:check` es obligatorio: esta versión requiere una migración aditiva para `story_creative_briefs.editorial_angle` y la tabla propia `topic_acquisition_lenses`. No se debe modificar `topic_editorial_profiles` ni crear una fila allí como efecto secundario.

## Definition of done

- El vocabulario de adquisición es configurable y versionado por topic y no contiene supuestos de Tech en el código común.
- Los nuevos briefs tienen ángulo, razón, stake y promesa estructurados en `editorial_angle`.
- El planner considera la diversidad mediante un ángulo provisional con una `taxonomyVersion` única por plan y el brief confirma la clasificación autoritativa.
- La selección de hooks conserva el contrato factual y las protecciones existentes.
- La UI permite revisar la decisión sin aplicarla silenciosamente.
- Pasan todas las pruebas obligatorias, `db:check`, lint y build.
- Se documenta la muestra manual multi-topic y cualquier caso donde el sistema haya elegido fallback.
