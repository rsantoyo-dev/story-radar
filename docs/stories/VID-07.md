---
id: VID-07
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-07 — Generar una narración maestra con ElevenLabs

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-02](VID-02.md), [VID-05](VID-05.md)

**Como** editor, **quiero** generar una narración maestra con ElevenLabs, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Construir un texto completo y estable a partir de las escenas aprobadas y realizar UNA generación TTS para esa versión de narración y voz. No generar ni concatenar TTS por escena.
- Persistir master-narration.mp3, respuesta de alineación, texto enviado/normalizado, voice ID, modelo, parámetros, hash y duración real. Configurar credenciales exclusivamente en servidor.
- Normalizar word/character alignment al contrato de palabras conservando su correspondencia con la narración original; comprobar omisiones, pronunciaciones, puntuación y marcas no pronunciadas.
- Si el modelo elegido no devuelve alineación utilizable, ejecutar un paso de alineación sobre el mismo máster; no generar otra voz para conseguir timings. Hacer explícito su coste/configuración.
- Conservar una representación de audio apta para recortes precisos y documentar retrasos de codificación. Una revisión de narración o voz invalida el máster y sus derivados; un cambio solo visual no.
- Reusar un máster completo de la misma revisión/configuración. Un timeout sin resultado conocido no causa otra llamada TTS automática: aplicar la política de reconciliación de VID-05.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
