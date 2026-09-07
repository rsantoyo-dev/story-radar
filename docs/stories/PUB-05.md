---
id: PUB-05
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p1]
---

# PUB-05 — Programar y cancelar una publicación

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** programar y cancelar una publicación, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P1 · **Dependencias:** PUB-04, PUB-07

**Criterios de aceptación**

- “Programar” permite elegir fecha, hora y zona IANA, muestra la hora local y conserva el instante UTC. Las horas inexistentes o ambiguas por cambio horario requieren una elección clara.
- Confirmar la programación autoriza el envío futuro del paquete y cuenta exactos, sin otro clic a la hora de entrega. Se ejecuta desde una cola o scheduler durable del SaaS; no depende de IG-07 de analítica.
- Los contenedores y URLs de entrega se preparan cerca del envío teniendo en cuenta su caducidad; no se crean al agendar una fecha lejana.
- Al ejecutar se comprueban de nuevo aprobación, permisos, actualidad documental, cuenta y disponibilidad de archivos. Una invalidación suspende la intención y avisa; no cambia el contenido o la cuenta por su cuenta.
- Cancelar o reprogramar es atómico frente al worker. Una vez iniciada una solicitud irreversible a Meta, no se promete cancelación hasta confirmar el resultado. No se elimina un post ya publicado.
- Un retraso del scheduler o del proveedor se registra con hora prevista y real. Se define una tolerancia antes de habilitar programación; pasada ella se suspende en lugar de publicar tarde silenciosamente.
- No se presenta como sincronización con el calendario de Business Suite. Esa integración solo se añadirá si una API oficial documentada permite el intercambio requerido.
