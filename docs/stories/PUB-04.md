---
id: PUB-04
feature: FEAT-PUB-001
status: review
board: instagram-publishing.kanban.md
tags: [publishing, review, p0]
---

# PUB-04 — Publicar ahora desde el SaaS

**Estado:** [[status-review]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** publicar ahora desde el SaaS, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-03, PUB-07

**Criterios de aceptación**

- “Publicar ahora” presenta cuenta, pieza, texto y conjunto exactos. La acción explícita autoriza ese envío; la aprobación editorial sola no lo inicia.
- El servidor vuelve a comprobar la autorización y vigencia, crea los contenedores correspondientes, espera su disponibilidad y ejecuta media_publish. Se conserva cada ID de proveedor y transición.
- En carruseles se respeta el orden congelado y se envía un único post. No se publican slides sueltos como alternativa ante un fallo.
- La UI distingue preparando, publicando, pendiente de confirmación, publicado y fallido. Un contenedor terminado no equivale a una publicación confirmada.
- El trabajo persiste y puede continuar aunque el editor cierre el navegador. Ningún endpoint depende de una pestaña abierta ni mantiene un sleep hasta completar el proceso.


## Prueba real confirmada con ngrok — 9 de septiembre de 2026

El usuario confirmó en esta sesión que la conexión y la publicación de Instagram funcionaron desde la app local mediante ngrok, después de configurar el origen HTTPS público y el secreto del worker. Evidencia: confirmación manual del usuario («funcionó»); no se adjuntó un ID/permalink ni se identificó si el envío fue foto o carrusel.

El bloqueo de la prueba local queda superado. Esta confirmación no acredita por sí sola todas las pruebas de foto/carrusel, recuperación con navegador cerrado, reinicio del worker, deduplicación, trazabilidad ni operación desplegada. Esos criterios siguen pendientes; no se marca toda la historia como hecha. Las notas anteriores de pausa se conservan como historial, no como estado actual.

Pasos reproducibles: [ejecutar en localhost con ngrok](../features/instagram-publishing-worker.md#ejecutar-en-localhost-con-ngrok).

## Implementación y correcciones — 9 de septiembre de 2026

- La orden se persiste antes de ejecutar cualquier envío, con clave idempotente por paquete/cuenta/acción. Repetir el POST inicial devuelve la misma orden, incluso si su paquete ya fue consumido. Un reintento exige `retryJobId`, solo acepta un fallo seguro y reactiva esa misma fila con una actualización condicional; conserva los IDs de contenedores anteriores como entradas `retired`.
- Cada ejecución reclama un lease de 150 segundos y realiza un paso acotado: validación, creación de una imagen, comprobación de un hijo, creación del padre, consulta del contenedor o envío. No hay recursión ni `sleep` en las rutas. El límite de ruta es 120 segundos; un worker que perdió o agotó el lease no puede avanzar ni iniciar otro envío.
- `after()` y las lecturas del panel son aceleradores. El proceso independiente `npm run worker:instagram` invoca la ruta autenticada `POST /api/internal/instagram-publications/resume`, selecciona hasta cuatro órdenes por pasada y retoma filas abandonadas sin depender del navegador. Debe ejecutarse bajo supervisión en el despliegue: añadir el script al repositorio no lo activa automáticamente.
- Se fijan cuenta, conexión y configuración originales. Se vuelven a comprobar permisos, cuota, aprobación y hash antes de `media_publish`, y la identidad/token y el estado del paquete antes de cada llamada de creación/envío. Reconectar no redirige órdenes pendientes.
- La respuesta de `media_publish` guarda el ID remoto en `pending-confirmation`. La siguiente pasada repara el registro local y consume el paquete; solo después marca `published`. Si la escritura falla, se retoma únicamente ese registro, incluso si el paquete expiró o la cuenta fue reconectada. También se recuperan filas antiguas marcadas `published` antes de completar el registro.
- Una interrupción en `publishing` pasa a reconciliación sin volver a ejecutar `media_publish`. Un contenedor `PUBLISHED` sin ID remoto produce una incidencia `suspended/uncertain`: el ID del contenedor no se utiliza como ID del post. No se ofrecen reintentos para ese caso.
- El panel recupera la última orden guardada al abrirse, muestra el registro local pendiente cuando ya existe ID remoto y distingue los fallos reintentables de incidencias inciertas.

El esquema existente de `0057/0058` representa estas correcciones; no se añade una migración. Configuración y pruebas manuales: [operación del worker](../features/instagram-publishing-worker.md).

Validación local: pruebas de dominio y PostgreSQL en memoria para concurrencia, reintento explícito, recuperación tras fallo de escritura y preservación de correcciones manuales; comprobaciones de TypeScript, lint, build y db:check. Pendiente de publicación end-to-end autorizada y de validar el worker en el entorno desplegado.

## Pausa de pruebas reales — 9 de septiembre de 2026

El usuario pausa el trabajo tras un HTTP 400 de Meta, sin contenedores ni media registrados. Pendiente configurar URL de entrega HTTPS pública y secreto/proceso worker; localhost continúa configurado. El envío real sigue en QA. Pasos exactos para retomar y diagnóstico: [nota de pausa en PUB-08](PUB-08.md#pausa-de-qa-local--9-de-septiembre-de-2026). No activar ni reintentar órdenes por esta nota.
