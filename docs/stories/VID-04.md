---
id: VID-04
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-04 — Editar y aprobar el VideoPlan

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-03](VID-03.md)

**Como** editor, **quiero** editar y aprobar el VideoPlan, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Permitir revisar y editar narración, orden/tipo de escenas, personaje/voz, textos en pantalla y referencias visuales; mostrar los hechos y recursos de origen.
- Revalidar los rangos de narración y referencias después de cada edición. Detectar contenido sin evidencia, referencias vencidas, falta de permisos y configuración incompleta.
- La aprobación corresponde a una versión y hash concretos del plan; la aprobación del script fuente no se hereda automáticamente al plan adaptado.
- Un cambio de contenido invalida la aprobación aplicable. Aprobar el plan y ordenar Generar video son acciones diferenciadas y claramente identificadas.
- Usar componentes y tokens UXDSL existentes, paleta verde y breakpoints del proyecto; mostrar estados y motivos de bloqueo sin detalles internos del proveedor.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
