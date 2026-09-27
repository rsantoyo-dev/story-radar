---
id: PUB-05
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-05 — Programar y cancelar una publicación

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** programar y cancelar una publicación, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** [PUB-07](PUB-07.md), [PUB-10](PUB-10.md), [PUB-11](PUB-11.md), [PUB-13](PUB-13.md), [PUB-14](PUB-14.md)

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

## Contrato de programación — 26 de septiembre de 2026

- Programar desde el preview aprobado, con la misma fecha/hora para ambos destinos o una diferente para cada uno. Fijar una zona IANA por programación con el default del Topic; cambiar el default después no desplaza órdenes existentes.
- Conservar la revisión aprobada y referencias durables a sus assets durante toda la espera. Separar retención del paquete, vigencia de la aprobación y caducidad de URLs/contenedores: un paquete actual con TTL corto no se puede usar sin adaptación para fechas lejanas.
- El scheduler de Press Craftor es el único responsable del envío futuro en esta entrega, para ambas plataformas. La etiqueta de UI es «Programada en Press Craftor»; que una orden exista aquí no demuestra que esté en el calendario de Meta Business Suite.
- No enviar una orden al calendario remoto y mantener también un worker que la publique. Una futura programación nativa requerirá otro modo explícito y reconciliación de su ID remoto, documentado tras verificar la API.
- Reclamar trabajos vencidos mediante lease/transición condicional e índice por estado/fecha. Un reinicio o ejecución duplicada del scheduler conserva el mismo job y nunca adelanta una publicación por una conversión de zona.
- Reprogramar registra fecha anterior/nueva, actor y versión esperada; cancelar o «Publicar ahora» compite atómicamente con el worker. El resultado indica si se aceptó, si el envío ya comenzó o si hay que confirmar el resultado remoto.
- Registrar hora solicitada, hora de inicio y hora real del proveedor. Definir tolerancia de retraso por política y probarla con la cadencia real del worker; no prometer puntualidad al minuto con un disparador de cinco minutos.
- Notificar en la app suspensión, retraso fuera de tolerancia, fallo parcial y necesidad de reconectar. Una publicación exitosa en un destino no se cancela ni se repite por cambiar el otro.

## Validación y entrega

Pruebas de DST (hora inexistente y repetida), UTC/zona del navegador diferentes, paquete programado más allá de su TTL actual, dos schedulers, reinicio durante preparación, cancelación y reprogramación concurrentes, adelanto manual y caída prolongada. Verificar también el calendario y el historial cuando solo uno de los dos destinos termina.
