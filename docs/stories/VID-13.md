---
id: VID-13
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-13 — Revisar previews y regenerar solo dependencias afectadas

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-04](VID-04.md), [VID-05](VID-05.md), [VID-12](VID-12.md)

**Como** editor, **quiero** revisar previews y regenerar solo dependencias afectadas, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Mostrar el progreso por etapa, preview reproducible, errores accionables y versiones de renders dentro del Video Draft, recuperables al cerrar/reabrir el navegador.
- Permitir solicitar cambios al plan o a recursos concretos; clasificar su impacto antes de generar de nuevo. Conservar la historia y no reemplazar silenciosamente el render revisado.
- Cambiar narración/voz crea nueva revisión del máster y recompila tiempos/captions, invalidando clips dependientes. Cambiar solo fondo/texto visual conserva la voz y clips compatibles.
- La regeneración requiere una orden explícita, usa la cola y respeta presupuestos. Un fallo de render o alpha permite repetir solo esa etapa.
- La UI usa UXDSL y la paleta/breakpoints existentes. Permite revisar capas, sincronía, subtítulos y hechos sin mostrar al editor claves de almacenamiento o detalles internos innecesarios.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
