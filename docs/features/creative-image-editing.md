# Feature: Edición incremental de imágenes dentro del draft

**ID:** FEAT-IMG-001  
**Estado:** En curso — IMG-01 e IMG-02 en revisión / QA; IMG-06 parcial (bloqueo de generación incompatible), a la espera de IMG-03; resto por hacer  
**Producto:** Press Craftor  
**Tablero:** [creative-image-editing.kanban.md](creative-image-editing.kanban.md)

## Problema y resultado esperado

Un draft puede tener sus imágenes generadas y necesitar ajustes pequeños en una sola unidad. El editor debe poder guardar esas instrucciones dentro del draft, aplicarlas sobre una imagen concreta y continuar trabajando después de recibir o aprobar el resultado final, sin regenerar todo el conjunto.

Ejemplo: en un carrusel de tres slides, ajustar el título del segundo conserva las imágenes del primero y el tercero. La nueva versión del segundo mantiene su imagen base, instrucción e historial.

## Flujo propuesto

1. Abrir el mismo draft y mejorar el título o texto visual de una slide. Como alternativa, elegir “Editar esta imagen” para un ajuste visual manual.
2. Guardar el draft conserva el texto nuevo y marca únicamente las imágenes afectadas como “Pendiente de actualizar”, sin ejecutar generación. Una instrucción manual se guarda con “Guardar cambio”.
3. Pulsar “Actualizar esta imagen”: el sistema prepara la instrucción con el texto representado por la imagen base y el nuevo texto guardado, sin exigir escribir un prompt adicional.
4. La actualización usa la imagen anterior como base, o recompone sobre el original y su receta cuando existen; crea una versión de esa unidad y conserva las demás.
5. Comparar, continuar editando o incorporar la versión al conjunto.
6. Revisar y aprobar el conjunto exacto antes de tratarlo como listo para publicación.

Guardar una solicitud, ejecutar una edición, seleccionar un resultado y aprobar una publicación son acciones distintas. No se exige una aprobación humana intermedia para ejecutar: la aprobación editorial se realiza sobre el resultado final.

## Alcance y decisiones

- Se admiten drafts anteriores a esta feature y resultados ya aprobados, conservando históricos.
- El prompt de generación original y las instrucciones posteriores se guardan por separado. Cada resultado identifica su versión base y la solicitud exacta aplicada.
- El texto y la composición se editan determinísticamente cuando existen original y receta. Una imagen aplanada no contiene capas editables por defecto.
- Las ilustraciones pueden usar edición generativa sobre la imagen base cuando su política y permisos lo permiten. Una edición generativa no garantiza conservar todos los detalles ajenos a la instrucción.
- Las fotografías documentales y los mapas conservan las protecciones de [fidelidad de lugares reales](real-place-visual-fidelity.md). No se reconstruye un lugar mediante IA para realizar un ajuste.
- No incluye edición masiva, un editor gráfico por capas completo, pinceles o máscaras manuales, publicación automática ni modificación de posts remotos de Instagram.

**Actualización selectiva implementada para texto:** en un post o carrusel generativo existente, guardar cambios de título, subtítulo, cuerpo o CTA conserva los archivos en una nueva revisión del mismo draft. Cada imagen compara su snapshot de texto con el texto guardado y muestra “Pendiente de actualizar” cuando difieren. “Actualizar esta imagen” prepara una edición sobre la base anterior sin escribir un prompt ni aprobar previamente el nuevo guion. El resultado requiere revisión; no se aprueba ni publica automáticamente.

**Alcance actual:** se conserva el conjunto cuando las unidades mantienen identidad, orden, formato, personajes y configuración visual. Cambiar su estructura, encuadre o dirección visual mantiene el recorrido de un lote nuevo. La recomposición determinista documental (IMG-03), la selección libre de versiones y la revisión conjunta completa de IMG-04/05 siguen pendientes; esta entrega no cierra todas las historias IMG.

### Persistencia y validación de la actualización de texto

- Guardar no llama al generador. Una transacción versiona el draft y crea registros del conjunto nuevo que apuntan a los mismos archivos, con el mismo número de versión de imagen. Los registros originales y sus aprobaciones permanecen históricos; `carriedFromAssetId` conserva la identidad del resultado reutilizado. Los registros del conjunto nuevo tienen IDs propios y quedan sin aprobar. No se duplica el archivo ni se necesita migración.
- Se conservan los IDs de las unidades existentes al guardar. Si el título cambia otra vez durante una generación, la nueva revisión conserva la última imagen disponible y el trabajo anterior queda en el lote histórico. Su resultado no actualiza el texto de la nueva revisión.
- La acción guarda base, instrucción automática, texto anterior y objetivo y versión del draft en el snapshot del resultado. La inserción condicional protege contra duplicados y versiones obsoletas. Los fallos se muestran y permiten reintentar desde la base original.
- La aprobación del draft comprueba que sus imágenes actuales estén terminadas y correspondan al texto guardado. Aprobar o descargar una imagen como lista vuelve a comprobar la correspondencia y las protecciones existentes de política y permisos. Restaurar el texto anterior elimina el desfase sin generar otra imagen, pero no restaura una aprobación histórica.
- Cambiar solo el caption o metadatos no visuales conserva las imágenes. Las referencias de marca de las unidades se conservan en las ediciones de texto y sus permisos se vuelven a comprobar al usarlas.
- Validación automatizada: pruebas de comparación de texto y PostgreSQL aislado para conservación de archivos/versiones, aprobaciones históricas, actualización de una sola unidad en un draft sin aprobar y rechazo de doble ejecución. Pasaron 440 pruebas, lint y build (incluye TypeScript). No hay migración nueva. La generación con Fal y la revisión visual en el entorno del usuario siguen pendientes.

## Historias y entrega

Todas las historias siguientes forman parte del MVP. Los criterios se mantienen en este documento y en sus fichas de `docs/stories`. Estado actual: **IMG-01** y **IMG-02** en revisión / QA; **IMG-06** parcialmente implementada con IMG-02 (bloqueo de generación incompatible + política viva) y bloqueada en su parte de recomposición determinista hasta **IMG-03**; **IMG-03, IMG-04, IMG-05, IMG-07, IMG-08** por hacer. La protección de concurrencia de **IMG-07** (clave por revisión de solicitud, sin trabajos duplicados) se adelantó con IMG-01/IMG-02.

### IMG-01 — Guardar instrucciones de cambio por imagen

**Ficha:** [IMG-01](../stories/IMG-01.md)

**Como** editor, **quiero** guardar una instrucción junto a cada imagen del draft, **para** retomar ajustes sin perderlos ni ejecutar una generación.

**Prioridad:** P0 · **Dependencias:** ninguna

**Criterios de aceptación**

- Cada unidad muestra “Editar esta imagen”, la versión base seleccionada y un campo de instrucción separado del prompt original.
- “Guardar cambio” persiste la instrucción, el draft, la unidad, la versión base y la revisión de la solicitud. Recargar o volver al draft recupera esos datos.
- Guardar una instrucción pendiente no llama al proveedor, no cambia imágenes ni invalida aprobaciones existentes; la interfaz distingue cambios sin guardar, guardados y aplicados.
- Se puede modificar o descartar una solicitud pendiente sin eliminar instrucciones ya ejecutadas ni su historial.
- Los drafts existentes permiten guardar instrucciones sin regenerar sus imágenes. La interfaz utiliza UXDSL, la paleta del proyecto y sus breakpoints.
- El editor puede cambiar el título o texto visual desde los campos de la slide en el mismo draft, sin crear otro draft ni duplicar el contenido en un prompt manual. Guardar crea una revisión del draft y conserva sus imágenes e históricos.
- Cada imagen conserva el snapshot del texto que representa. Al guardar, se compara con el texto visual vigente de su unidad: solo las unidades afectadas quedan “Pendiente de actualizar”, incluso después de recargar. Cambios de caption u otros campos que no aparecen en la imagen no requieren actualizarla.
- Guardar una instrucción visual pendiente no altera la aprobación del conjunto. Guardar texto editorial sí crea una revisión pendiente de aprobación, aunque las imágenes anteriores permanezcan visibles; conserva la aprobación histórica, sin transferirla a la nueva revisión.


### IMG-02 — Aplicar un cambio únicamente a la imagen seleccionada

**Ficha:** [IMG-02](../stories/IMG-02.md)

**Como** editor, **quiero** aplicar una instrucción guardada sobre una imagen existente, **para** ajustarla sin regenerar el resto del carrusel.

**Prioridad:** P0 · **Dependencias:** IMG-01

**Criterios de aceptación**

- “Aplicar a esta imagen” utiliza la solicitud guardada y la versión base exacta. Si hay texto sin guardar, se indica y se permite guardarlo antes de aplicar.
- Para ilustraciones editables se utiliza el endpoint explícito image-to-image con la imagen base; nunca se sustituye silenciosamente por una generación desde cero.
- Cada ejecución crea una nueva versión vinculada a su base, instrucción exacta, revisión de solicitud, proveedor, modelo, parámetros, uso y resultado.
- Las otras unidades conservan sus imágenes y selecciones. El nuevo resultado queda pendiente de revisión y no reemplaza un archivo histórico.
- Se mantiene la proporción configurada, actualmente 4:5 a 1080×1350. Si no existe acceso al original o autorización para enviarlo al proveedor, la solicitud termina con un motivo visible.
- Una instrucción de cambio pequeño no garantiza que el proveedor conserve todos los otros detalles; la interfaz permite revisar el resultado antes de seleccionarlo.
- El resultado permanece como **candidato** (versión pendiente de revisión) hasta incorporarlo al conjunto mediante **IMG-05**; aplicar no lo aprueba ni lo publica.
- Concurrencia (parte de IMG-07 adelantada): la ejecución bloquea la solicitud (`saved → running`) con compare-and-swap y sólo escribe su resultado si la fila sigue en la misma revisión; guardar otra instrucción durante la generación crea una revisión nueva y el trabajo en curso no la marca como aplicada.
- “Actualizar esta imagen” toma el texto guardado del draft y genera automáticamente la instrucción de sustitución a partir del snapshot de texto de la imagen base y del texto nuevo. No requiere un prompt manual ni volver a aprobar el guion antes de preparar el resultado.
- La actualización se limita a la unidad seleccionada y conserva los archivos, versiones y vínculo al resultado original de las otras imágenes, aunque el draft tenga una revisión nueva; sus registros de pertenencia al conjunto nuevo pueden tener IDs propios. No fuerza regenerar el lote completo.
- Cada resultado registra la identidad de la unidad, la revisión del draft y los snapshots de texto anterior y nuevo, además de la base e instrucción exactas. La edición generativa usa la imagen existente y pide conservar el resto; no garantiza que el proveedor mantenga cada detalle.
- El prompt manual sigue disponible para ajustes visuales adicionales. No modifica silenciosamente los campos de texto del draft; una instrucción incompatible con el texto guardado debe corregirse antes de ejecutar.


### IMG-03 — Editar texto y composición conservando el original

**Ficha:** [IMG-03](../stories/IMG-03.md)

**Como** editor, **quiero** ajustar texto, posición y marca con controles de composición, **para** hacer cambios precisos sin alterar la fotografía.

**Prioridad:** P0 · **Dependencias:** IMG-01

**Criterios de aceptación**

- Cuando existen original y receta de composición, se ofrecen controles para texto, escala proporcional, posición y márgenes; sus valores quedan guardados en el draft.
- Aplicar vuelve a componer determinísticamente y crea una versión con la receta exacta, sin llamar al generador de imágenes.
- La UI distingue imágenes con composición editable de imágenes aplanadas. No promete editar texto incrustado como una capa inexistente.
- En imágenes aplanadas se indica la limitación y solo se ofrece edición generativa si la política efectiva la permite.
- Los cambios de texto editorial respetan las reglas del recorrido de origen; el documental conserva la exigencia de texto sustentado. Atribuciones, licencias y rótulos obligatorios permanecen legibles.
- Un cambio de título guardado en el draft alimenta la receta de la unidad cuando existe composición reproducible. Se sustituye el texto y se recompone solo esa imagen, conservando el original y sin llamar al proveedor generativo. El texto incrustado en una imagen aplanada sigue las limitaciones de IMG-02/IMG-06.


### IMG-04 — Comparar versiones y continuar editando

**Ficha:** [IMG-04](../stories/IMG-04.md)

**Como** editor, **quiero** consultar y comparar el historial de cada imagen, **para** elegir un resultado y seguir ajustándolo.

**Prioridad:** P0 · **Dependencias:** IMG-02, IMG-03

**Criterios de aceptación**

- El historial muestra miniatura, fecha, versión base, instrucción aplicada, tipo de edición, estado y aprobación de cada resultado.
- Se puede comparar base y resultado y elegir cualquier versión disponible como punto de partida de otra edición.
- Cada ejecución conserva su relación con la base, incluso si parte de una versión antigua. La instrucción nueva no sobrescribe instrucciones previas.
- Recuperar una versión anterior cambia la selección del conjunto en una revisión nueva; no borra versiones posteriores ni restaura automáticamente la aprobación del conjunto.
- Una versión cuyo archivo ya no está disponible conserva sus metadatos y muestra que no puede utilizarse como base.

### IMG-05 — Revisar el conjunto después de una edición

**Ficha:** [IMG-05](../stories/IMG-05.md)

**Como** editor, **quiero** editar también después de aprobar el resultado final, **para** corregir una publicación conservando lo previamente revisado.

**Prioridad:** P0 · **Dependencias:** IMG-04

**Criterios de aceptación**

- Los drafts aprobados siguen ofreciendo edición por imagen. Guardar una intención de cambio no modifica el conjunto aprobado.
- Incorporar un resultado o recuperar otra versión crea una revisión del conjunto pendiente de aprobación. Las unidades sin cambios reutilizan sus versiones existentes.
- La revisión muestra qué unidades cambiaron y cuáles se conservaron. La aprobación registra actor, fecha y las versiones exactas del conjunto.
- Exportar como listo o publicar exige aprobación vigente del conjunto seleccionado; una aprobación histórica no aprueba una revisión nueva.
- Cancelar o rechazar una edición conserva el resultado anterior. No hay publicación ni aprobación automática después de aplicar cambios.
- Si la publicación ya salió a Instagram, editar el draft no modifica el post remoto ni su vínculo histórico; actualizarlo o republicarlo queda fuera de esta feature.
- La revisión conjunta vincula el texto vigente de cada unidad con la versión de imagen seleccionada. No permite aprobar, exportar como listo ni publicar una revisión con imágenes pendientes de actualizar respecto de su texto visual.
- Incorporar una imagen actualizada conserva las versiones de las unidades sin cambios y requiere aprobación final del conjunto exacto. Rechazar el candidato conserva la imagen anterior, pero no elimina el estado pendiente si el texto del draft sigue siendo distinto.
- Si se restaura el texto representado por la imagen seleccionada, se elimina el desfase sin generar otra imagen; la revisión editorial nueva sigue necesitando aprobación final.


### IMG-06 — Respetar la fidelidad documental y los permisos

**Ficha:** [IMG-06](../stories/IMG-06.md)

**Como** editor, **quiero** que las ediciones respeten la política vigente del draft, **para** evitar que un ajuste convierta un lugar real en una representación engañosa.

**Prioridad:** P0 · **Dependencias:** IMG-02, IMG-03

**Criterios de aceptación**

- El servidor comprueba la política efectiva y las condiciones de uso al ejecutar y al incorporar un resultado; una política antigua del snapshot no permite saltar restricciones actuales.
- En fotografía documental solo se permite recomposición sobre el original elegible. No se envía al generador para añadir, eliminar o reconstruir edificios, personas o elementos del lugar.
- Los mapas se recomponen con sus datos y proveedor autorizados; no se modifican calles ni marcadores mediante generación.
- La edición con referencias verifica permisos para transformación y envío al proveedor y conserva la identificación de ilustración cuando corresponda.
- Una solicitud incompatible se guarda con una explicación, pero no se ejecuta ni cambia silenciosamente de modo. Cambiar de política requiere el flujo explícito existente.
- La evidencia, el original, las condiciones de uso y la atribución permanecen vinculados a cada versión. La nueva versión vuelve a requerir la revisión final correspondiente.

### IMG-07 — Controlar errores, concurrencia y coste por edición

**Ficha:** [IMG-07](../stories/IMG-07.md)

**Como** editor, **quiero** que cada edición tenga un estado y límites propios, **para** reintentar fallos sin perder resultados ni pagar ejecuciones duplicadas.

**Prioridad:** P0 · **Dependencias:** IMG-02, IMG-05, IMG-06

**Criterios de aceptación**

- Los estados distinguen solicitud guardada, en ejecución, resultado pendiente de revisión y fallo; los errores se muestran en la unidad afectada.
- La ejecución usa una clave idempotente vinculada a draft, unidad, base y revisión de solicitud. Un doble clic no inicia dos trabajos; un reintento deliberado conserva su propio intento.
- Cada trabajo utiliza un snapshot inmutable. Editar una instrucción durante la ejecución crea una revisión distinta y no altera el trabajo en curso.
- Un resultado tardío no sobrescribe una selección, solicitud o aprobación posterior. Se conserva en historial y se presenta como resultado de una revisión anterior.
- Los límites de tiempo, intentos y presupuesto creativo existentes se aplican por ejecución; no se reintenta indefinidamente ni se cambia a un proveedor más caro de forma silenciosa.
- Autorización, lectura del original, proveedor y almacenamiento se ejecutan en servidor con aislamiento por tema. No se exponen claves privadas ni URLs con credenciales.
- Un fallo del proveedor o almacenamiento conserva la base y las otras unidades, registra el estado y permite reintento acotado.
- El snapshot y la clave idempotente de una actualización automática incluyen la identidad de la unidad, base, revisión de solicitud y revisión o hash del texto visual objetivo. Si el título cambia durante la ejecución, el resultado anterior se conserva en historial y no marca como actualizada la nueva versión del texto.
- La correspondencia usa una identidad estable de unidad, no solo su posición en el carrusel. Reordenar slides no asigna instrucciones o imágenes a otra unidad; eliminar una unidad impide incorporar trabajos tardíos a otra slide.


### IMG-08 — Validar edición incremental y regresiones

**Ficha:** [IMG-08](../stories/IMG-08.md)

**Como** editor, **quiero** validar el recorrido con drafts nuevos, existentes y aprobados, **para** entregar ajustes por imagen sin degradar el flujo editorial.

**Prioridad:** P0 · **Dependencias:** IMG-07

**Criterios de aceptación**

- Pruebas verifican persistencia al recargar, separación de prompt e instrucción y ausencia de llamadas al proveedor al guardar.
- En un carrusel de tres imágenes, editar la segunda produce una sola nueva imagen; las versiones de la primera y tercera se conservan.
- Pruebas cubren base antigua, comparación, recuperación de versión, archivo ausente, doble envío, fallo parcial, cambio de política y resultado asíncrono obsoleto.
- La composición documental conserva el original y los rótulos; se comprueba que ninguna rama documental llama al generador, incluso ante un error.
- Editar un conjunto aprobado exige una nueva aprobación del conjunto modificado y conserva la trazabilidad de exportaciones y publicaciones anteriores.
- Se valida el flujo en móvil y escritorio con un draft existente y un carrusel aprobado. Pasan pruebas relevantes, lint y build; db:check solo si se requieren migraciones. Se documentan bloqueos reales del entorno.
- En un carrusel existente y aprobado, cambiar el título de la segunda slide y guardar conserva las tres imágenes sin llamadas al proveedor, marca solo la segunda pendiente y recupera ese estado al recargar. Actualizarla produce una sola versión nueva, usando su imagen anterior y el texto guardado sin prompt manual.
- Pruebas cubren varios cambios de título antes de aplicar, cambio durante la ejecución, reordenación de slides, restauración del texto anterior y cambios de caption sin efecto visual. Ningún resultado obsoleto elimina el estado pendiente del texto vigente.
- La aprobación y exportación del conjunto se bloquean mientras texto e imagen estén desfasados; después de incorporar el resultado y revisar el conjunto, las otras unidades conservan sus versiones. Se verifica tanto la edición generativa como la recomposición determinista.


## Orientación técnica

Reutilizar las abstracciones de drafts, unidades, lotes, versiones de assets y almacenamiento privado. Una revisión del conjunto debe poder referenciar las versiones sin cambios y el nuevo resultado sin duplicar sus archivos ni mutar un lote aprobado. La elección del esquema se confirma al implementar; no se prescribe una migración si el modelo versionado existente puede representar el comportamiento.

Persistir la solicitud pendiente fuera del estado local del navegador. Cada ejecución conserva draft/unidad, versión base, revisión de solicitud, tipo de edición, instrucción o receta exacta, política efectiva, estado, resultado y datos disponibles de uso. No se inventan identidades individuales donde la autenticación existente no las proporciona.

La compatibilidad con assets históricos debe distinguir original accesible, composición reproducible e imagen aplanada. Una limitación impide únicamente la operación afectada y se explica en la misma unidad.

### Integración de tipografía en el draft existente

Cuando el guion solicita reconstrucción geográfica, «Compose images in this draft» compone todas las unidades como tipografía a 1080×1350. Conserva el draft, la versión, los IDs de unidades y el texto guardado; cada imagen requiere su aprobación habitual. El renderizado local usa nombre y paleta de marca, sin generar el lugar ni abrir una publicación documental separada. `providerEndpoint=local/draft-typography-v1` identifica estos assets; se almacenan usando el servicio de archivos Fal existente (retención de 30 días), sin llamar al modelo generador. La descarga conserva las comprobaciones de versión, texto y aprobación.

Esta integración cubre la alternativa tipográfica. La selección automática de originales/mapas dentro del mismo draft y las ediciones generativas de estos assets no están habilitadas por este cambio.

### Integración con lugares reales — 2026-09-08

Las imágenes compuestas de fotografías o mapas abiertos pueden recomponerse individualmente desde el texto guardado del mismo borrador. El snapshot conserva `placeVisual` y la procedencia; una actualización deja la nueva imagen pendiente de revisión y conserva las versiones anteriores. El material geográfico se vuelve a consultar: no se aplica edición generativa que invente detalles del lugar. Ver [recorrido geográfico genérico](real-place-visual-fidelity.md).
