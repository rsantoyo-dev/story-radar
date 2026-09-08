---
id: IMG-05
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-05 — Revisar el conjunto después de una edición

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

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

**Avance de actualización de texto:** implementado para unidades con identidad, orden y configuración visual conservados. Véanse alcance, persistencia y validación en la feature; no da por terminados los demás criterios de esta historia.
