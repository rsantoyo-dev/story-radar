---
id: PUB-01
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-01 — Identificar publicaciones listas para publicar

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** identificar publicaciones listas para publicar, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** IG-01 a IG-06 como base existente

**Criterios de aceptación**

- La aprobación vigente del texto y de todas las imágenes seleccionadas hace que el conjunto sea candidato. En el recorrido documental se utiliza su aprobación final conjunta; aprobar solo el guion nunca basta.
- El servidor determina “Lista para publicar” mediante un snapshot del conjunto exacto, política vigente, evidencia, permisos de uso, archivos accesibles y destino configurado. Muestra los motivos que impiden habilitarlo.
- Crear la candidatura no envía contenido a Meta ni agenda una publicación. Cada cambio al texto público, selección de assets o destino exige revalidación y, si modifica el contenido aprobado, nueva aprobación.
- Los borradores y publicaciones existentes conservan su historial. El estado de entrega pertenece a una intención de publicación y no sustituye el estado editorial del draft.
