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
- Concurrencia (parte de IMG-07 adelantada): aplicar bloquea la solicitud (`saved → running`) con compare-and-swap; guardar otra instrucción durante la generación crea una revisión nueva y el trabajo en curso no la marca como aplicada ni fallida.
