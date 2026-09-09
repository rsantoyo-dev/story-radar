---
id: VID-05
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-05 — Persistir Video Jobs y orquestar etapas recuperables

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-02](VID-02.md), [VID-04](VID-04.md)

**Como** editor, **quiero** persistir Video Jobs y orquestar etapas recuperables, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Crear una orden explícita e idempotente para la versión aprobada del plan, congelando script, política, imágenes/personajes, voz/configuración y versiones de contratos. Revalidar vigencia antes de iniciar operaciones de proveedor.
- Persistir etapas, dependencias, intentos, IDs de proveedor, resultados, errores saneados y presupuestos. Reutilizar patrones de repositorio/worker cuando corresponda; diseñar migraciones solo para datos nuevos que el modelo existente no pueda representar.
- Un worker independiente del navegador reclama trabajos mediante lease y transiciones condicionales. Persistir la solicitud remota y consultar su resultado sin depender de una petición HTTP abierta ni de after() como único motor.
- Reanudar tras reinicio sin regenerar etapas completadas. Distinguir fallo seguro y resultado incierto: reconciliar o pedir resolución explícita antes de repetir una operación pagada; no prometer exactly-once remoto.
- Acotar concurrencia, duración, intentos y gasto; mostrar cancelación de etapas futuras sin prometer detener una solicitud remota ya iniciada. Guardar resultados que lleguen tarde sin promoverlos a una revisión cancelada.
- Permitir asset resolution y TTS independientes; lip-sync requiere timeline y segmento de audio válido, y render requiere ResolvedVideo listo. Documentar arranque, supervisión y recuperación local/staging.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
