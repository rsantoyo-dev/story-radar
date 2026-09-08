---
id: IMG-01
feature: FEAT-IMG-001
status: review
board: creative-image-editing.kanban.md
tags: [img, review, p0]
---

# IMG-01 — Guardar instrucciones de cambio por imagen

**Estado:** [[status-review]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

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

**Avance de actualización de texto:** implementado para unidades con identidad, orden y configuración visual conservados. Véanse alcance, persistencia y validación en la feature; no da por terminados los demás criterios de esta historia.
