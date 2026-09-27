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

**Prioridad:** P0 · **Dependencias:** PUB-04, PUB-07 · **Ampliación Meta:** [PUB-13](PUB-13.md)

**Criterios de aceptación**

- Elegir y documentar hosting, URL HTTPS pública estable y worker supervisado o scheduler externo autenticado, con secretos separados por entorno y acceso público a archivos de entrega.
- Verificar migraciones aplicadas, presupuesto de ejecución, leases y recuperación tras reinicio. No equiparar db:check con migraciones aplicadas en producción.
- Añadir observabilidad de último ciclo, cola pendiente, errores saneados e incidencias; definir alertas y responsable de operación sin exponer secretos.
- Probar en staging con el navegador cerrado y el worker reiniciado, sin duplicar envíos ni cambiar destinos. Publicaciones reales requieren autorización para la prueba.
- Dejar un runbook de puesta en marcha, parada y recuperación. Mantener programación deshabilitada hasta verificar el servicio durable y la política de retrasos de PUB-05.

**Avance — 25 de septiembre de 2026**

- Diagnóstico de producción: `RADAR_APP_URL` en Vercel apuntaba al túnel de ngrok; los secretos de colector y de worker sí estaban configurados. Ver la sección «Despliegue en Vercel (alfa)» de [instagram-publishing-worker.md](../features/instagram-publishing-worker.md).
- Añadido el autodiagnóstico `GET /api/radar/meta/health`, la sección Environment del panel de Instagram y el bloqueo de la acción de conectar cuando el origen no coincide.
- Añadido `.github/workflows/instagram-publication-worker.yml` como scheduler externo cada cinco minutos, inactivo hasta configurar variable y secreto en GitHub.
- Pendiente: corregir la variable en Vercel y redesplegar, registrar la URI de callback en Meta, reconectar, observabilidad del último ciclo y runbook completo.

## Ampliación Meta — 26 de septiembre de 2026

Las notas de avance anteriores son evidencia fechada. Verificar de nuevo el despliegue antes de cerrar pendientes; esta ampliación documental no acredita cambios en Vercel, GitHub ni Meta.

- Supervisar entregas de Facebook e Instagram y reparaciones de registro con el contrato de PUB-13. Credenciales del scheduler, del usuario y de los proveedores tienen ámbitos separados y se resuelven en servidor.
- El job autorizado persiste cuenta, paquete, actor/política y alcance. El worker no recibe autorización para crear publicaciones arbitrarias; comprueba que la orden concreta sigue vigente antes de enviar.
- Monitorizar heartbeat, lag de cola, vencimientos de lease, tiempo en confirmación incierta, reparaciones pendientes y errores por destino. Mostrar disponibilidad del servicio y avisar de suspensión en la app; fijar responsable y runbook.
- Acreditar la cadencia real del scheduler y su tolerancia de retraso antes de habilitar PUB-05. Un cron cada cinco minutos es un disparador con esa granularidad, no una garantía de publicación exacta al minuto.
- Probar caída antes/después del envío irreversible, redeploy, dos instancias concurrentes, permisos revocados y recuperación sin duplicados. Separar pruebas simuladas de publicaciones reales autorizadas.
- Documentar retención de paquetes y archivos programados/históricos, rotación de secretos, pausado del worker y reparación local de un post ya confirmado. Ninguna tarea de limpieza elimina assets necesarios para una entrega pendiente o un historial protegido.
