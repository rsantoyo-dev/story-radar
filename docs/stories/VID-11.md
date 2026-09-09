---
id: VID-11
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-11 — Construir y validar ResolvedVideo listo para render

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-06](VID-06.md), [VID-08](VID-08.md), [VID-10](VID-10.md)

**Como** editor, **quiero** construir y validar ResolvedVideo listo para render, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Resolver todas las escenas a plantillas y assets concretos, incluyendo capas, posiciones, animaciones permitidas, captions, trims, FPS, duración y dimensiones 1080×1920.
- Incluir una sola pista de narración máster; todos los clips de personaje se reproducen silenciados y con compensaciones de tiempo explícitas.
- No admitir recursos pendientes, prompts ejecutables, selección de modelos, búsquedas, instrucciones de generación ni código arbitrario. VO/STAT/TEXT/CTA son datos para plantillas predefinidas.
- Comprobar hashes, permisos, dimensiones, alpha, duraciones, fuentes y cobertura de la timeline. Cualquier dependencia inválida mantiene el job en preparación/bloqueado.
- Crear un paquete de render reproducible con manifiesto, assets y versiones de plantilla/renderer. El worker prepara y verifica los archivos locales antes de invocar Remotion; el componente no depende de URLs temporales de fal.
- El manifiesto público de preview no revela object keys ni secretos. El hash semántico excluye URLs firmadas y rutas locales variables, pero incluye todo lo que afecta al contenido renderizado.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
