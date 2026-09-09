---
id: VID-16
feature: FEAT-VID-001
status: backlog
board: video-draft.kanban.md
tags: [video, backlog, p1]
---

# VID-16 — Publicar el video aprobado como Reel — fase posterior

**Estado:** [[status-backlog]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P1 · Fuera de fase 1 · **Dependencias:** [VID-14](VID-14.md), [VID-15](VID-15.md)

**Como** editor, **quiero** publicar el video aprobado como Reel — fase posterior, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Diseñar una ampliación explícita de PUB para Reels, verificando contratos y requisitos vigentes de Meta al implementar. No reutilizar sin cambios el publicador de fotos/carruseles.
- Consumir únicamente un video final aprobado y su paquete exacto; conservar cuenta, revisión, autorización explícita, estado de entrega e idempotencia.
- Preparar entrega pública temporal compatible con Meta sin abrir el bucket ni exponer referencias privadas; persistir contenedores/media y reconciliar resultados inciertos antes de cualquier reintento.
- Vincular el Reel a historia, Video Draft, render y aprobación, preservando cambios manuales y evitando duplicados tras sync.
- Validar cada publicación real con autorización explícita y cuenta de prueba. Programación futura y calendario de Business Suite no se incorporan automáticamente a esta tarea.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
