---
id: VID-01
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-01 — Validar Jo y Sofi con voz, lip-sync y transparencia

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** Ninguna; puede comenzar con el contexto existente.

**Como** editor, **quiero** validar Jo y Sofi con voz, lip-sync y transparencia, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Preparar una prueba de 5–10 segundos por personaje usando su imagen aprobada y una voz asignada; cada prueba usa una sola narración completa.
- Ejecutar ElevenLabs → fal-ai/sync-lipsync/v3/image-to-video → veed/video-background-removal con output_codec=vp9; registrar modelos, parámetros, IDs de solicitud, latencia y coste observado.
- Comprobar identidad, boca, pelo, manos, bordes, parpadeo y sincronía; componer sobre fondo claro, oscuro y texto pasando detrás, tanto en preview como en un render Remotion.
- Verificar alpha real, duración, FPS, dimensiones y desfase de audio de los archivos descargados. No asumir transparencia por la extensión WebM ni aprobar solo mediante metadatos.
- Documentar resultado por personaje, restricciones de entrada, umbrales medidos y decisión de viabilidad. Un resultado insuficiente bloquea la aceptación visual de fase 1; no se oculta con un cambio de proveedor o un fondo opaco.
- Esta tarea describe pruebas pagadas con proveedores: no ejecutarlas por crear estos documentos. Al implementarla, acordar el presupuesto de la prueba y usar referencias autorizadas.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
