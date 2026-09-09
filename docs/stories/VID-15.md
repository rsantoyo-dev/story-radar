---
id: VID-15
feature: FEAT-VID-001
status: todo
board: video-draft.kanban.md
tags: [video, todo, p0]
---

# VID-15 — Validar la fase 1 de extremo a extremo

**Estado:** [[status-todo]] · **Feature:** [Video Draft](../features/video-draft.md)

**Prioridad:** P0 · Fase 1 · **Dependencias:** [VID-14](VID-14.md)

**Como** editor, **quiero** validar la fase 1 de extremo a extremo, **para** producir video con trazabilidad, revisión y recuperación de errores.

## Criterios de aceptación

- Cubrir con pruebas de contratos/dominio la derivación, evidencia, aprobaciones, narración única, compilación, invalidación selectiva y manifiesto listo para render.
- Probar con base aislada idempotencia, leases, concurrencia, reinicio, respuesta remota incierta, fallos de persistencia, límites y cancelación. Los tests automáticos no llaman proveedores pagados ni la base real.
- Validar el renderer con assets de prueba y tolerancias explícitas: alpha sobre texto, sincronía, captions, clips cortos, silencios, frames finales y ausencia de narración duplicada.
- Con presupuesto y referencias autorizados, completar al menos un video con Jo y otro con Sofi, incluyendo escenas NARRATOR y VO/gráficos. Comprobar costo/tiempo real y calidad contra los umbrales de VID-01.
- Cerrar/reabrir navegador y reiniciar workers; recuperar resultados sin regenerar etapas completadas. Corregir un fondo y demostrar que no vuelve a llamarse TTS/Sync-3/VEED.
- Validar lint, build, TypeScript, pruebas relevantes y db:check si hubo esquema; documentar requisitos de R2, entrega a proveedores, credenciales, proceso de render y supervisión en local/staging. La aceptación no requiere publicar en Meta.

## Validación y entrega

Implementar las comprobaciones correspondientes a estos criterios, registrar evidencia y actualizar esta ficha y el tablero. Esta planificación no implica que la tarea esté implementada ni autoriza generación pagada, publicación o despliegue.
