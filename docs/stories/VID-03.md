---
id: VID-03
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-03 — Crear Video Draft y Video Director desde Script Draft

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-02](VID-02.md)

**Como** editor, **quiero** crear Video Draft y Video Director desde Script Draft, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Añadir una acción Crear Video Draft desde una versión guardada de Script Draft; el original, su aprobación y sus imágenes permanecen intactos. Derivar un draft no ejecuta TTS, lip-sync ni render.
- Capturar versión del guion, historia, tema, hechos, evidencia, política editorial/visual, marca y referencias de personajes. Reutilizar las abstracciones del repositorio y verificar pertenencia al tema.
- El Video Director genera un VideoPlan estructurado con narración completa, rangos de texto por escena, tipo de escena, hechos usados, intención visual, capas y recursos propuestos. La selección de proveedor/modelo pertenece al servidor.
- Validar la salida del modelo antes de persistir; nuevas afirmaciones sin respaldo quedan bloqueadas para revisión. El texto del artículo y las respuestas AI se tratan como datos no confiables.
- Asignar Jo o Sofi y una única voz para el video. Mantener el texto narrado separado de títulos, gráficos y subtítulos; no inferir rangos de escena buscando frases que podrían repetirse.
- Un cambio posterior del Script Draft marca la derivación como desactualizada y ofrece una nueva revisión explícita; no reescribe automáticamente el Video Draft existente.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
