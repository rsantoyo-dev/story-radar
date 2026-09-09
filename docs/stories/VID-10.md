---
id: VID-10
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-10 — Obtener alpha del personaje con VEED

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-01](VID-01.md), [VID-09](VID-09.md)

**Como** editor, **quiero** obtener alpha del personaje con VEED, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Enviar el talking-character.mp4 a veed/video-background-removal con output_codec=vp9. Configurar refine_foreground_edges y subject_is_person según la referencia y las conclusiones de VID-01.
- Validar la respuesta video como lista de archivos y seleccionar el resultado WebM esperado; no asumir el mismo contrato de respuesta que Sync-3.
- Descargar y guardar WebM, hash, metadatos, versión y request ID en R2. Verificar alpha efectivo y continuidad temporal, además de comparar duración/desfase con el clip de entrada.
- Mostrar defectos de recorte para revisión; una salida opaca o con recorte inaceptable no se sustituye silenciosamente por el MP4 original.
- Un fallo de eliminación de fondo permite reintentar solo esta etapa, conservando TTS y Sync-3. H264 con RGB/máscara separadas queda fuera del camino inicial salvo una decisión posterior documentada.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
