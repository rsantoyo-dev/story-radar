---
id: VID-06
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-06 — Resolver fondos, imágenes y gráficos del plan

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-02](VID-02.md), [VID-05](VID-05.md)

**Como** editor, **quiero** resolver fondos, imágenes y gráficos del plan, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Reutilizar assets aprobados, fotos, gráficos y slides existentes cuando sean adecuados; generar mediante la integración actual de GPT Image solo los recursos pendientes autorizados.
- Recomponer recursos 4:5 para el lienzo de video 9:16 sin estirarlos ni recortar datos, atribuciones o texto esencial. Mantener las reglas de fidelidad de lugares/hechos y permisos de uso.
- Los textos y gráficos editables se describen como datos de plantillas Remotion; no pedir imágenes con texto horneado cuando debe seguir siendo editable.
- Persistir cada asset y su hash, versión, procedencia, dimensiones y referencias en R2 privado. Verificar disponibilidad y archivos descargados antes de marcar la etapa completa.
- Regenerar un fondo afecta sus escenas y renders dependientes, pero conserva narración, timings y clips de personaje que sigan vigentes.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
