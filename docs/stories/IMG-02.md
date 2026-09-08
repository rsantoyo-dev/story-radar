---
id: IMG-02
feature: FEAT-IMG-001
status: review
board: creative-image-editing.kanban.md
tags: [img, review, p0]
---

# IMG-02 — Aplicar un cambio únicamente a la imagen seleccionada

**Estado:** [[status-review]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** aplicar una instrucción guardada sobre una imagen existente, **para** ajustarla sin regenerar el resto del carrusel.

**Prioridad:** P0 · **Dependencias:** IMG-01

**Criterios de aceptación**

- “Aplicar a esta imagen” utiliza la solicitud guardada y la versión base exacta. Si hay texto sin guardar, se indica y se permite guardarlo antes de aplicar.
- Para ilustraciones editables se utiliza el endpoint explícito image-to-image con la imagen base; nunca se sustituye silenciosamente por una generación desde cero.
- Cada ejecución crea una nueva versión vinculada a su base, instrucción exacta, revisión de solicitud, proveedor, modelo, parámetros, uso y resultado.
- Las otras unidades conservan sus imágenes y selecciones. El nuevo resultado queda pendiente de revisión y no reemplaza un archivo histórico.
- Se mantiene la proporción configurada, actualmente 4:5 a 1080×1350. Si no existe acceso al original o autorización para enviarlo al proveedor, la solicitud termina con un motivo visible.
- Una instrucción de cambio pequeño no garantiza que el proveedor conserve todos los otros detalles; la interfaz permite revisar el resultado antes de seleccionarlo.
- El resultado permanece como **candidato** (versión pendiente de revisión) hasta incorporarlo al conjunto mediante **IMG-05**; aplicar no aprueba ni publica.
- Quitar todas las referencias de marca se distingue de heredarlas: lista vacía explícita = "sin referencias", ausencia = hereda las de la imagen base.
- Concurrencia (parte de IMG-07 adelantada): aplicar bloquea la solicitud (`saved | failed → running`) con compare-and-swap; guardar otra instrucción durante la generación crea una revisión nueva y el trabajo en curso no la marca como aplicada ni fallida.
- Un fallo síncrono del proveedor/almacenamiento al enviar marca la solicitud `failed` (nunca `applied`), descarta la versión muerta para que la base siga vigente, y "Reintentar" vuelve a ejecutar la misma revisión. (Un fallo asíncrono posterior del poller sobre un resultado ya enviado es alcance de IMG-07.)
- “Actualizar esta imagen” toma el texto guardado del draft y genera automáticamente la instrucción de sustitución a partir del snapshot de texto de la imagen base y del texto nuevo. No requiere un prompt manual ni volver a aprobar el guion antes de preparar el resultado.
- La actualización se limita a la unidad seleccionada y conserva los archivos, versiones y vínculo al resultado original de las otras imágenes, aunque el draft tenga una revisión nueva; sus registros de pertenencia al conjunto nuevo pueden tener IDs propios. No fuerza regenerar el lote completo.
- Cada resultado registra la identidad de la unidad, la revisión del draft y los snapshots de texto anterior y nuevo, además de la base e instrucción exactas. La edición generativa usa la imagen existente y pide conservar el resto; no garantiza que el proveedor mantenga cada detalle.
- El prompt manual sigue disponible para ajustes visuales adicionales. No modifica silenciosamente los campos de texto del draft; una instrucción incompatible con el texto guardado debe corregirse antes de ejecutar.

**Avance de actualización de texto:** implementado para unidades con identidad, orden y configuración visual conservados. Véanse alcance, persistencia y validación en la feature; no da por terminados los demás criterios de esta historia.
