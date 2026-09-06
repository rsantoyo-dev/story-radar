---
id: IMG-04
feature: FEAT-IMG-001
status: todo
board: creative-image-editing.kanban.md
tags: [img, todo, p0]
---

# IMG-04 — Comparar versiones y continuar editando

**Estado:** [[status-todo]] · **Feature:** [Edición incremental de imágenes](../features/creative-image-editing.md)

**Como** editor, **quiero** consultar y comparar el historial de cada imagen, **para** elegir un resultado y seguir ajustándolo.

**Prioridad:** P0 · **Dependencias:** IMG-02, IMG-03

**Criterios de aceptación**

- El historial muestra miniatura, fecha, versión base, instrucción aplicada, tipo de edición, estado y aprobación de cada resultado.
- Se puede comparar base y resultado y elegir cualquier versión disponible como punto de partida de otra edición.
- Cada ejecución conserva su relación con la base, incluso si parte de una versión antigua. La instrucción nueva no sobrescribe instrucciones previas.
- Recuperar una versión anterior cambia la selección del conjunto en una revisión nueva; no borra versiones posteriores ni restaura automáticamente la aprobación del conjunto.
- Una versión cuyo archivo ya no está disponible conserva sus metadatos y muestra que no puede utilizarse como base.
