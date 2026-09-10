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

## Ampliación: calendario de Instagram y Facebook

Alcance planificado, todavía no implementado. La habilitación de programación depende de [PUB-11](PUB-11.md); la selección de ambos destinos depende de [PUB-10](PUB-10.md).

- Mostrar un calendario con filtros por plataforma/cuenta y estados, además de una lista de próximas entregas. La zona horaria elegida debe ser visible.
- Programar Instagram, Facebook o ambos sobre los paquetes aprobados de cada destino. Guardar entregas independientes; cancelar o reprogramar una no modifica una entrega ya publicada en el otro destino.
- Ofrecer detalle de la pieza, cuenta, fecha/hora y aprobación vigente antes de confirmar. Registrar modificaciones de horario y autor de la acción.
- Verificar selección de zona, cambios de horario de verano, concurrencia al cancelar/reprogramar, retrasos y fallos parciales de ambos destinos.
- Press Craftor es la fuente de las órdenes creadas aquí; no se sincroniza automáticamente con el calendario de Meta Business Suite. No incluir sugerencia de mejor hora ni métricas avanzadas en esta entrega.
