---
id: PUB-06
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-06 — Registrar y vincular automáticamente la publicación

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** registrar y vincular automáticamente la publicación, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-04

**Criterios de aceptación**

- Al confirmar el ID de media publicado se hace upsert del post en topic_instagram_media, aislado por tema y cuenta, con permalink cuando esté disponible, fecha y vínculo a la historia.
- El vínculo conserva draft, revisión, lote y selección exacta de versiones de assets, además del paquete congelado. Queda visible en la galería y los resultados de la historia sin búsqueda por similitud.
- La sincronización posterior de IG-02 deduplica por identidad remota y no borra la trazabilidad del envío ni una corrección manual posterior. Los trabajos publicados no reaplican vínculos que el editor corrigió.
- Una historia admite varias publicaciones. Se conserva el seguimiento story_social_publications existente como resumen compatible; su unicidad por historia/plataforma no limita ni reemplaza el historial de entregas individuales.
- Si Meta publicó pero falló la escritura local, se recupera el vínculo por el ID remoto registrado y la intención. Nunca se vuelve a publicar para reparar una asociación local.
- La ausencia temporal del permalink no oculta una publicación confirmada por ID. La actualización del enlace y metadatos puede completarse después.
