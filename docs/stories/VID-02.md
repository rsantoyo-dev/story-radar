---
id: VID-02
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-02 — Definir contratos versionados y reglas de invalidación

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** Ninguna; puede comenzar con el contexto existente.

**Como** editor, **quiero** definir contratos versionados y reglas de invalidación, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Definir y validar en servidor VideoPlan, VideoTimeline y ResolvedVideo con schemaVersion, IDs estables, procedencia, revisiones y hashes. Documentar sus esquemas y fixtures válidos e inválidos.
- VideoPlan expresa intención; VideoTimeline expresa tiempos reales; ResolvedVideo solo contiene decisiones y recursos resueltos. Ninguno admite código React, JavaScript, expresiones ejecutables ni URLs arbitrarias generadas por modelos.
- Fijar escenas VO, STAT, TEXT, CTA y NARRATOR, un narrador/voz por video, capas permitidas y plantillas predefinidas. Definir valores permitidos y límites de texto, escenas y duración.
- Definir un único reloj de audio, intervalos de muestras y frames, reglas de redondeo, subtítulos y silencios. Elegir y versionar el FPS de fase 1 sin inferirlo de los clips de proveedores.
- Definir dependencias e invalidación por cambios en narración, voz, imagen del personaje, fondos, textos, timeline y renderer. Conservar versiones históricas, aprobaciones y resultados originales.
- Distinguir el manifiesto persistido de sus rutas locales de ejecución: claves R2 y credenciales nunca llegan al navegador. Las URLs firmadas temporales no forman parte de la identidad semántica del render.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
