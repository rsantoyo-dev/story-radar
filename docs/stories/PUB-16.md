---
id: PUB-16
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p1, automation]
---

# PUB-16 — Automatizar la preparación y continuar después de la aprobación

**Estado:** [[status-todo]] · **Feature:** [Publicación en Meta](../features/instagram-publishing.md)

**Prioridad:** P1 · **Dependencias:** [PUB-05](PUB-05.md), [PUB-06](PUB-06.md), [PUB-10](PUB-10.md), [PUB-11](PUB-11.md), [PUB-14](PUB-14.md)

**Como** editor, **quiero** que al terminar la generación se prepare la publicación y que, tras aprobarla, se ejecute la entrega elegida, **para** no repetir pasos entre draft, calendario e historial.

## Criterios de aceptación

- Configurar por Topic/workflow el modo «Preparar preview automáticamente y esperar aprobación». La Editorial Line puede elegir entre opciones permitidas por el Topic; las conexiones, marca y destinos siguen siendo del Topic.
- La finalización durable de una revisión de draft dispara la preparación de PUB-14 una sola vez. Registrar Story, revisión, workflow, configuración y evento de origen; recuperar eventos pendientes si el proceso se interrumpe.
- Resolver contenido, fuentes, evidencia, assets, revisión factual y marca desde los snapshots editoriales. Si falta información o producción creativa, mostrar el paso pendiente; no publicar ni reinterpretar fuentes para completar hechos.
- Generar un preview por destino y proponer cuenta/horario según configuración, sin crear una autorización de entrega. Estados visibles: preparando, assets pendientes, requiere revisión, lista, programada/publicando, publicada y bloqueada.
- Una aprobación final explícita sobre ese preview puede autorizar «Publicar ahora» o «Programar». Tras esa decisión, el worker continúa sin exigir otro clic a la hora del envío, y PUB-06 registra vínculo y estado automáticamente.
- Persistir entradas, salidas, validaciones, actor, timestamps, intentos y errores de los pasos. Reanudar no regenera assets ya válidos, no vuelve a pagar llamadas de generación completadas y no crea otra orden por la misma aprobación.
- Cambiar la revisión mientras se prepara el preview vuelve obsoleta esa candidatura. Cambiar una política suspende las continuaciones incompatibles; no modifica silenciosamente paquetes ya autorizados.
- Mostrar la siguiente acción y el motivo concreto de bloqueo en la Story y en el historial. La automatización tiene pausa y reanudación por Topic, sin invalidar hechos de publicación ya confirmados.

## Límite del modo

Este modo conserva aprobación humana antes de publicar. La generación del draft por sí sola no autoriza envíos. El modo autónomo opcional tiene su propia política y criterios en [PUB-17](PUB-17.md).

## Validación y entrega

Simular finalización repetida, assets incompletos, revisión rechazada, aprobación final combinada, evento perdido recuperado, reinicio y pausa concurrente. Una generación terminada sin aprobación debe producir preview pendiente y cero llamadas de publicación.
