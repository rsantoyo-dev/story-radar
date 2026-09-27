---
id: PUB-08
feature: FEAT-PUB-001
status: review
board: instagram-publishing.kanban.md
tags: [publishing, review, p0]
---

# PUB-08 — Validar publicación y trazabilidad de extremo a extremo

**Estado:** [[status-review]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** validar publicación y trazabilidad de extremo a extremo, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-04, PUB-06, PUB-07

**Criterios de aceptación**

- Pruebas cubren aprobación parcial, versión editada, permiso ausente, cuenta sustituida, doble clic, workers concurrentes, timeout antes y después del envío y fallo de persistencia tras éxito remoto.
- Se verifica que un envío confirmado aparece una sola vez en galería e historia, asociado a su snapshot exacto, incluso tras sincronizar de nuevo o editar el draft actual.
- Para PUB-05 se añaden pruebas de zona horaria, cambio horario, caducidad, cancelación concurrente, reprogramación, retraso y pérdida de vigencia. No son requisito para entregar solamente “Publicar ahora”.
- Las pruebas de integración públicas requieren una cuenta de prueba y autorización explícita para cada publicación de validación. La documentación de esta feature no autoriza publicar contenido real.
- La UI usa UXDSL, la paleta del proyecto y sus breakpoints. Pasan pruebas relevantes, TypeScript, lint, build y db:check si hay cambios de esquema; los bloqueos se documentan.
- El despliegue de programación requiere scheduler/worker durable y observabilidad comprobados. Mientras falten se deshabilita “Programar”, manteniendo honesto el alcance disponible.


## Matriz de QA Meta — ampliación del 26 de septiembre de 2026

Alcance nuevo por implementar y validar. Las pruebas y confirmaciones anteriores se conservan como evidencia de Instagram, sin extender su resultado a Facebook ni a automatización.

| Recorrido | Resultado verificable | Historias |
|---|---|---|
| Conectar Meta o solo Instagram | Activos correctos, permisos por capacidad, callback de un uso y aislamiento entre workspaces | PUB-09, PUB-13, AUTH-04/05/06 |
| Finalizar draft y abrir preview | Texto/assets de la revisión exacta; faltantes visibles; cero envíos al generar | PUB-14, PUB-16 |
| Publicar foto/varias imágenes | Facebook, Instagram directo e Instagram mediante Facebook producen la representación aprobada | PUB-10 |
| Publicar en ambos, uno falla | Un post por destino exitoso; reintento únicamente del fallo seguro | PUB-07, PUB-10, PUB-13 |
| Timeout después del envío | Pendiente de confirmación; reconciliación por identidad; sin reenvío por similitud | PUB-07, PUB-10 |
| Meta confirma y falla la base local | Reparar post, vínculo y resumen desde el ID persistido sin otra publicación | PUB-06, PUB-13 |
| Consultar la Story publicada | Marca y filtro automáticos por Topic; éxito parcial visible; snapshot anterior conservado tras editar | PUB-06, PUB-12 |
| Sincronizar y vincular históricos | Una fila por identidad; manual link/unlink conservado; versión desconocida explícita | PUB-15 |
| Programar, adelantar, reprogramar y cancelar | UTC/zona/DST correctos; contienda con worker controlada; fecha prevista y real separadas | PUB-05 |
| Programar más allá del TTL actual | Snapshot/archivos retenidos; entrega temporal preparada cerca del envío | PUB-03, PUB-05, PUB-11 |
| Cerrar navegador o reiniciar servicio | Trabajo durable y recuperación dentro de la política de retrasos | PUB-11 |
| Automatización supervisada | Preview automático, aprobación final explícita y continuación sin otros clics | PUB-16 |
| Autonomía opcional | Default deshabilitado, autorización acotada, gates, cuotas, pausa y simulación | PUB-17 |
| Métricas por plataforma | Cero distinto de no disponible; observaciones atribuibles; publicación permanece confirmada | PUB-18 |

Registrar por cada recorrido entorno, versión de API, formato, cuenta de prueba, IDs/permalinks cuando proceda y resultado. La validación de cada fase exige sus propias historias, sin bloquear el MVP manual por funciones opcionales aún deshabilitadas.

Pruebas automáticas de dominio y base de datos usan fixtures de proveedor; QA visual verifica UXDSL, teclado y móvil. Durante la implementación ejecutar lint/build, pruebas afectadas y db:check cuando cambie esquema. La presente entrega de documentación se valida por coherencia, enlaces y dependencias; no equivale a ejecutar esta matriz.

## Prueba real confirmada con ngrok — 9 de septiembre de 2026

El usuario confirmó en esta sesión que la conexión y la publicación de Instagram funcionaron desde la app local mediante ngrok, después de configurar el origen HTTPS público y el secreto del worker. Evidencia: confirmación manual del usuario («funcionó»); no se adjuntó un ID/permalink ni se identificó si el envío fue foto o carrusel.

El bloqueo de la prueba local queda superado. Esta confirmación no acredita por sí sola todas las pruebas de foto/carrusel, recuperación con navegador cerrado, reinicio del worker, deduplicación, trazabilidad ni operación desplegada. Esos criterios siguen pendientes; no se marca toda la historia como hecha. Las notas anteriores de pausa se conservan como historial, no como estado actual.

Pasos reproducibles: [ejecutar en localhost con ngrok](../features/instagram-publishing-worker.md#ejecutar-en-localhost-con-ngrok).

## Validación local — 9 de septiembre de 2026

La suite incluye simulación de Meta y PostgreSQL en memoria: dos peticiones/worker concurrentes convergen en una orden y envío; un reintento explícito reutiliza la orden; el fallo de registro después del éxito remoto se repara sin reenviar; el sync y las reparaciones conservan un desvínculo manual; los leases caducados se recuperan. También se cubren rechazo de autorización del worker, timeout, cambio de conexión, aprobación revocada y límites de recuperación.

Estas pruebas no publican contenido ni usan la base de datos de la aplicación. Sigue pendiente el recorrido real de foto/carrusel y el funcionamiento del proceso supervisado en el despliegue. Lista de comprobación: [operación del worker](../features/instagram-publishing-worker.md).

Resultado final de esta revisión: **600/600 pruebas pasan**, junto con `npm run lint`, `npm run build`, `npx tsc --noEmit` y `npm run db:check`. No se ejecutó el worker contra datos reales ni se publicaron posts.

Seguimiento del bloqueo de autorización: **604/604 pruebas pasan**. Se añade el caso de una orden histórica suspendida antes de crear contenedores: permanece inactiva ante lecturas/POST repetidos y solo se reactiva mediante reintento explícito, con validación actual.

## Pausa de QA local — 9 de septiembre de 2026

Se pausa por decisión del usuario. El código queda integrado, pero la publicación real de foto/carrusel todavía no está validada; las tareas no se marcan como hechas.

Último intento: `failed/retryable`, HTTP 400 de Meta, un intento, sin IDs de contenedor padre ni media y sin contenedores guardados. La suspensión anterior de autorización ocurrió antes de cualquier envío y ya tiene reintento explícito seguro. La conexión y el token figuraban vigentes en el diagnóstico de solo lectura.

La configuración local todavía usa `RADAR_APP_URL` en localhost y no tiene `INSTAGRAM_PUBLISH_WORKER_SECRET`. Meta no puede descargar imágenes desde localhost: es la causa probable del HTTP 400, pero el detalle original del proveedor no quedó persistido y no está confirmada como causa única.

Para retomar:

1. Arrancar la app con `npm run dev` y abrir un túnel HTTPS público hacia el puerto 3000 (por ejemplo, `ngrok http 3000` si está instalado/configurado), o usar staging accesible públicamente.
2. En `.env.local`, poner la URL HTTPS pública en `RADAR_APP_URL`; configurar `INSTAGRAM_PUBLISH_WORKER_URL=http://127.0.0.1:3000` para el worker local y generar un secreto dedicado con `openssl rand -hex 32` para `INSTAGRAM_PUBLISH_WORKER_SECRET`. No guardar secretos en Git.
3. Reiniciar la app y ejecutar `npm run worker:instagram` en otra terminal. Mantener app, túnel y worker activos. El worker puede avanzar órdenes ya autorizadas: revisar los trabajos pendientes antes de arrancarlo.
4. Verificar que las migraciones `0057/0058` estén aplicadas en el entorno elegido. Revalidar el candidato y abrir el enlace actualizado `delivery file`: debe ser público, mostrar el JPEG y no exigir login ni una pantalla intermedia.
5. Cuando el usuario decida autorizar la prueba real, pulsar `Retry publishing` en la orden fallida. Si aparece la suspensión antigua sin actividad de proveedor, usar `Revalidate and retry publishing`. No reintentar automáticamente resultados inciertos.
6. Comprobar foto/carrusel, cierre del navegador, registro en galería/historia y ausencia de duplicados tras sync. Si persiste HTTP 400, obtener diagnóstico saneado del proveedor antes de asumir otra causa.

Si es necesario reconectar Instagram, registrar en Meta el callback exacto de la URL pública: `https://TU-URL-PUBLICA/api/radar/meta/callback`. Un túnel temporal puede cambiar de URL al reiniciarse.

Última validación de código: **604/604 pruebas pasan**, lint y build pasan; TypeScript incluido en build. La revisión previa también pasó `npx tsc --noEmit` y `npm run db:check`. No se añade ninguna migración en este seguimiento. Guía: [operación del worker](../features/instagram-publishing-worker.md).
