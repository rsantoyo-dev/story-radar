---
id: IMG-03
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-03 — Editar texto y composición conservando el original

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** ajustar texto, posición y marca con controles de composición, **para** hacer cambios precisos sin alterar la fotografía.

**Prioridad:** P0 · **Dependencias:** IMG-01

**Criterios de aceptación**

- Cuando existen original y receta de composición, se ofrecen controles para texto, escala proporcional, posición y márgenes; sus valores quedan guardados en el draft.
- Aplicar vuelve a componer determinísticamente y crea una versión con la receta exacta, sin llamar al generador de imágenes.
- La UI distingue imágenes con composición editable de imágenes aplanadas. No promete editar texto incrustado como una capa inexistente.
- En imágenes aplanadas se indica la limitación y solo se ofrece edición generativa si la política efectiva la permite.
- Los cambios de texto editorial respetan las reglas del recorrido de origen; el documental conserva la exigencia de texto sustentado. Atribuciones, licencias y rótulos obligatorios permanecen legibles.
