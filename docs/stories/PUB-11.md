---
id: PUB-11
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-11 — Desplegar y supervisar la publicación permanente

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** tener app y worker operativos de forma permanente, **para** publicar sin depender de mi computadora o ngrok.

**Prioridad:** P0 · **Dependencias:** PUB-04, PUB-07

**Criterios de aceptación**

- Elegir y documentar hosting, URL HTTPS pública estable y worker supervisado o scheduler externo autenticado, con secretos separados por entorno y acceso público a archivos de entrega.
- Verificar migraciones aplicadas, presupuesto de ejecución, leases y recuperación tras reinicio. No equiparar db:check con migraciones aplicadas en producción.
- Añadir observabilidad de último ciclo, cola pendiente, errores saneados e incidencias; definir alertas y responsable de operación sin exponer secretos.
- Probar en staging con el navegador cerrado y el worker reiniciado, sin duplicar envíos ni cambiar destinos. Publicaciones reales requieren autorización para la prueba.
- Dejar un runbook de puesta en marcha, parada y recuperación. Mantener programación deshabilitada hasta verificar el servicio durable y la política de retrasos de PUB-05.
