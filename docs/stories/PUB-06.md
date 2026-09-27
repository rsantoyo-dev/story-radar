---
id: PUB-06
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-06 — Registrar y vincular automáticamente la publicación

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

> Registro y vínculo implementados junto con PUB-04; recuperación y preservación
> corregidas el 9 de septiembre. El upsert añade el paquete de origen y no vuelve
> a aplicar un vínculo que el editor corrigió o eliminó. Las pruebas con PostgreSQL
> en memoria cubren sync posterior, deduplicación y recuperación tras error local.
> Pendiente: revisar el resumen compatible `story_social_publications` y la
> visualización end-to-end en galería e historia con una publicación real autorizada.

**Como** editor, **quiero** registrar y vincular automáticamente la publicación, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-04 · **Ampliación Meta:** [PUB-10](PUB-10.md), [PUB-13](PUB-13.md)

**Criterios de aceptación**

- Al confirmar el ID de media publicado se hace upsert del post en topic_instagram_media, aislado por tema y cuenta, con permalink cuando esté disponible, fecha y vínculo a la historia.
- El vínculo conserva draft, revisión, lote y selección exacta de versiones de assets, además del paquete congelado. Queda visible en la galería y los resultados de la historia sin búsqueda por similitud.
- La sincronización posterior de IG-02 deduplica por identidad remota y no borra la trazabilidad del envío ni una corrección manual posterior. Los trabajos publicados no reaplican vínculos que el editor corrigió.
- Una historia admite varias publicaciones. Se conserva el seguimiento story_social_publications existente como resumen compatible; su unicidad por historia/plataforma no limita ni reemplaza el historial de entregas individuales.
- Si Meta publicó pero falló la escritura local, se recupera el vínculo por el ID remoto registrado y la intención. Nunca se vuelve a publicar para reparar una asociación local.
- La ausencia temporal del permalink no oculta una publicación confirmada por ID. La actualización del enlace y metadatos puede completarse después.

## Ampliación Meta: vínculo y marca de Story publicada

- Consumir de forma idempotente la confirmación persistida de cada adaptador. Registrar plataforma, cuenta/página, ID remoto, instante real, paquete, orden/entrega, Topic, Story, revisión de draft y assets exactos.
- Aplicar la proyección de post, vínculo y resumen de Story de forma atómica cuando sea posible. Si son varios pasos, persistir su avance y reparación pendiente para converger tras un fallo; nunca volver a llamar a la operación remota de publicar.
- Mostrar automáticamente «Publicada en Instagram», «Publicada en Facebook» o «Publicada en ambos» en la Story del Topic. Al menos una confirmación real hace que aparezca en el filtro de publicadas; si hay otro destino pendiente, añadir «Programada», «Fallida» o «Pendiente de confirmación» para ese destino.
- Distinguir `tienePublicaciones` de `ordenCompletada`: una orden con dos destinos solo está completamente publicada cuando ambos están confirmados. El envío o la programación, por sí solos, no marcan una Story publicada.
- Resolver el indicador desde el historial confirmado y los vínculos vigentes, con origen propio/externo y por Topic. No cambiar el estado de otro Topic que comparte la Story ni sobrescribir `stories.published_at`, que describe la fuente.
- Conservar el estado editorial y la aprobación de cada revisión por separado. La nueva marca, filtros y contadores de distribución usan la misma proyección; un nuevo draft no borra la publicación anterior ni hereda su aprobación.
- El resumen compatible por plataforma refleja la última publicación confirmada; trabajos posteriores programados o fallidos se muestran aparte y no degradan ese hecho. Una corrección manual de vínculo recalcula los resúmenes afectados conservando el origen histórico del paquete.
- Las publicaciones históricas continúan accesibles aunque se archive la Story o cambie su decisión editorial. Adaptar los lectores que hoy filtran únicamente Stories aprobadas para no ocultar entregas confirmadas.
- Backfill idempotente para publicaciones propias de Instagram ya confirmadas cuya Story todavía no refleje la entrega. No hacer backfill por similitud, no fabricar revisiones faltantes y no deshacer desvínculos manuales.

## Validación de la ampliación

Simular confirmación doble, éxito remoto seguido de caída, sync anterior/posterior al registro, permiso revocado durante reparación, publicación sin permalink, un éxito y un fallo, dos Topics con la misma Story, revisión nueva y post histórico enlazado/corregido. Verificar marca automática sin clic adicional y cero reenvíos durante reparación.
