---
id: VID-09
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-09 — Generar clips NARRATOR con Sync-3

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-01](VID-01.md), [VID-05](VID-05.md), [VID-08](VID-08.md)

**Como** editor, **quiero** generar clips NARRATOR con Sync-3, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Extraer el segmento de cada escena NARRATOR del máster existente, conservando límites de muestras y márgenes. No generar nueva voz ni alterar la velocidad para ajustar el plano.
- Resolver la imagen aprobada/versionada de Jo o Sofi desde el registro de personajes y llamar fal-ai/sync-lipsync/v3/image-to-video con image_url y audio_url.
- Usar entrega temporal controlada de entradas o el almacenamiento del proveedor, según sus requisitos; no reutilizar ni exponer referencias privadas sin autorización. Guardar request ID y consultar la cola.
- Descargar y persistir el MP4 original, metadatos, hash y vínculo exacto a imagen, máster y segmento. Validar duración, dimensiones y desfase antes de continuar.
- No invocar Sync-3 para escenas sin narrador visible. Reutilizar clips cuyo contenido de audio, personaje y parámetros sigan idénticos aunque cambie un fondo; una invalidación del máster exige comprobar de nuevo sus dependencias.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
