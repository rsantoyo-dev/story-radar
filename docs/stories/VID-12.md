---
id: VID-12
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-12 — Implementar el renderer Remotion y sus plantillas

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-11](VID-11.md)

**Como** editor, **quiero** implementar el renderer Remotion y sus plantillas, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Implementar un renderer cuya responsabilidad sea exclusivamente JSON resuelto → frames → archivo de video. No llama ElevenLabs/fal, no busca imágenes, no elimina fondos ni decide modelos.
- Crear plantillas deterministas para VO, STAT, TEXT, CTA y NARRATOR, con capas fondo → textos/gráficos detrás → personaje alpha → textos/gráficos delante → captions.
- Usar fuentes, FPS, tamaños y animaciones versionados, sin aleatoriedad no fijada ni dependencia de la hora. Validar el contrato de entrada antes de empezar.
- Componer el máster una sola vez y respetar offsets/recortes del personaje silenciado. Verificar transparencia tanto en preview como en exportación usando la integración Remotion apropiada.
- Ofrecer perfiles definidos de preview y final que conserven contenido, tiempos y composición; fase 1 entrega MP4 1080×1920 sin alpha final.
- Ejecutar render en un worker con recursos y presupuesto explícitos; reintentar un fallo de render reutiliza el paquete preparado sin invocar proveedores creativos. Revisar compatibilidad de despliegue y licencia aplicable de Remotion antes de producción.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
