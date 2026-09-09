---
id: PUB-02
feature: FEAT-PUB-001
status: review
board: instagram-publishing.kanban.md
tags: [publishing, review, p0]
---

# PUB-02 — Verificar la capacidad de publicar de la cuenta

**Estado:** [[status-review]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** verificar la capacidad de publicar de la cuenta, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-01

**Criterios de aceptación**

- La configuración verifica instagram_business_content_publish para Instagram Login y los requisitos de acceso de la aplicación en la versión elegida. No se considera que insights operativo implique permiso de publicación.
- La UI distingue cuenta desconectada, reconexión necesaria, permiso de publicación ausente y cuenta habilitada. Nunca publica un post de prueba para verificar acceso sin una orden explícita.
- Cada intención fija el ID de cuenta, tema y revisión de conexión. Cambiar de cuenta no redirige trabajos pendientes; reconectar exige comprobar que sigue siendo la misma cuenta y que el trabajo continúa autorizado.
- Las credenciales y llamadas viven en servidor. Una capacidad ausente bloquea el envío con un motivo y conserva el borrador listo editorialmente.

## Implementación — 9 de septiembre de 2026

- Dominio puro `instagram-publishing.ts`: preflight de conexión (`disconnected` / `needs-reconnect` / `missing-permission` / `unverified`) sin llamar a Meta; `verifyPublishingAccess` orquesta una prueba **read-only** contra `GET {ig-user-id}/content_publishing_limit` (`fetchInstagramPublishingQuota`) — nunca crea un contenedor ni llama a `media_publish`.
- `PublishingIdentity` = `{ topicId, igUserId, connectionVersion, appConfigurationVersion }`. Un cambio de cuenta/conexión durante la verificación (segundo `load()` o `expectedIdentity` distinto) devuelve `connection-changed` y descarta la cuota. `publishingAccessIsCurrent` rechaza evidencia cacheada del navegador (estado ≠ `enabled`, identidad/versión de API distinta, o fuera del TTL de 5 min).
- Fallos del proveedor se clasifican: 401/código 190 → `needs-reconnect`; 429/códigos 4,17,32,613,80002 → `rate-limited`; permiso/403 → `missing-permission`; resto → `unavailable`. Nunca se filtran errores crudos ni tokens.
- Ruta `POST /api/radar/topics/[topicId]/meta/publishing-access` (`server-only`, `maxDuration 30`): verificación explícita, sin mutar aprobación ni conexión; errores saneados (503).
- Integración con PUB-01: `getPublicationCandidate` pasa `verifyPublishingAccess` a `validatePublicationCandidate`. Sólo `enabled` retira el último blocker y permite `state: "ready"`; cualquier otro estado deja el conjunto como `candidate` con su motivo (`publishing-access-<state>` / `publishing-access-unavailable`). El navegador no aporta la evidencia: se recomputa en servidor en cada validación. El panel muestra el estado y la cuota (`n/total posts left`).
- Sin migración ni cambios de aprobación/historial. La persistencia de la intención de publicación y su clave de idempotencia siguen siendo PUB-03/PUB-07.

Validación: `npm test` (556, incluidas 12 de dominio de PUB-02 + integración candidato), `npm run lint`, `npm run build`, `npx tsc --noEmit`. Pendiente de revisión visual con una cuenta real conectada.

### Corrección: permisos OAuth no registrados

Una lista `granted_permissions` vacía se trata como desconocida, no como una denegación de Meta. Con token vigente se realiza la comprobación de cuota en vivo; un rechazo real conserva `missing-permission` y un fallo de consulta bloquea la capacidad. No se inventan scopes ni se escribe una autorización en la base. Una lista conocida que omite los permisos requeridos sigue bloqueando el preflight. El parser OAuth también conserva arrays de scopes, además del formato separado por comas.

Diagnóstico de solo lectura del 9 de septiembre: la conexión vigente de `canada.en.claro`, con scopes locales vacíos, recibió HTTP 200 en `content_publishing_limit` y cuota 0/100. No se crearon contenedores ni publicaciones. Esta comprobación no certifica App Review ni garantiza la aceptación de un futuro envío.
