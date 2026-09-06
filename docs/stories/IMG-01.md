---
id: IMG-01
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-01 — Guardar instrucciones de cambio por imagen

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** guardar una instrucción junto a cada imagen del draft, **para** retomar ajustes sin perderlos ni ejecutar una generación.

**Prioridad:** P0 · **Dependencias:** ninguna

**Criterios de aceptación**

- Cada unidad muestra “Editar esta imagen”, la versión base seleccionada y un campo de instrucción separado del prompt original.
- “Guardar cambio” persiste la instrucción, el draft, la unidad, la versión base y la revisión de la solicitud. Recargar o volver al draft recupera esos datos.
- Guardar no llama al proveedor, no cambia imágenes ni invalida aprobaciones existentes; la interfaz distingue cambios sin guardar, guardados y aplicados.
- Se puede modificar o descartar una solicitud pendiente sin eliminar instrucciones ya ejecutadas ni su historial.
- Los drafts existentes permiten guardar instrucciones sin regenerar sus imágenes. La interfaz utiliza UXDSL, la paleta del proyecto y sus breakpoints.
