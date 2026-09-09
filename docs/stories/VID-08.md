---
id: VID-08
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-08 — Compilar la timeline a partir del audio real

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-02](VID-02.md), [VID-07](VID-07.md)

**Como** editor, **quiero** compilar la timeline a partir del audio real, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Compilar VideoPlan y alineación del máster de manera determinista a VideoTimeline; las duraciones sugeridas por el Director no prevalecen sobre el audio real.
- Asignar escenas mediante IDs/rangos de narración, incluyendo frases repetidas. Resolver palabras normalizadas, pausas, silencios iniciales/finales y límites sin cortar palabras.
- Calcular timestamps, rangos de muestras y frames a FPS fijo con una regla única de redondeo que evite deriva, huecos o solapamientos accidentales.
- Generar captions desde la misma alineación y definir su partición y límites de lectura. La timeline cubre el máster completo y cualquier silencio/cola visual queda representado explícitamente.
- Generar descriptores de recorte solo para escenas NARRATOR, con márgenes y compensaciones explícitos; VO/STAT/TEXT/CTA se resuelven mediante plantillas sin solicitar lip-sync.
- Validar duraciones máximas y correspondencia texto/audio antes de continuar. Probar silencios, signos, palabras repetidas, clips cortos y redondeo en límites de frames.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
