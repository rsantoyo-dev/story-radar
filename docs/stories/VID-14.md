---
id: VID-14
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-14 — Aprobar, exportar y conservar el video final en R2

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-13](VID-13.md)

**Como** editor, **quiero** aprobar, exportar y conservar el video final en R2, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Vincular la aprobación al hash de ResolvedVideo, assets y versiones de plantilla/renderer que produjo el preview revisado, registrando actor y fecha.
- La exportación final usa ese mismo paquete y un perfil de calidad definido. Cambios de contenido, tiempo, fuente, plantilla o renderer invalidan la aprobación; no se aprueba cualquier MP4 por pertenecer al mismo draft.
- Verificar el MP4 final 1080×1920, streams de audio/video, duración y reproducción; comprobar que no existe voz duplicada ni pérdida de capas/captions.
- Persistir en R2 privado el MP4 final, preview, manifiestos y archivos intermedios versionados con trazabilidad hacia Script Draft y VideoPlan.
- Ofrecer descarga autenticada o temporal controlada, con histórico de renders y estados claros. Guardar en R2 o aprobar no inicia publicación en Meta.
- Definir retención y limpieza de temporales sin eliminar archivos referenciados por trabajos, revisiones o aprobaciones históricas.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
