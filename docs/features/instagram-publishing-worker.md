# Operación y pruebas de publicación inmediata

El envío utiliza órdenes persistidas en PostgreSQL y un worker independiente. `after()` y el polling del panel aceleran el progreso; el worker retoma los trabajos aunque el navegador esté cerrado o el servidor haya reiniciado. No programa publicaciones futuras: PUB-05 sigue pendiente.

## Estado de la prueba local

El 9 de septiembre de 2026 el usuario confirmó que la conexión y publicación de Instagram funcionaron usando localhost y ngrok, tras configurar el origen público y el secreto del worker. Es una validación manual reportada por el usuario; el formato y el ID remoto no quedaron registrados en esta nota. El despliegue supervisado y la matriz completa de recuperación siguen pendientes en [PUB-08](../stories/PUB-08.md).

## Ejecutar en localhost con ngrok

Prerequisitos: dependencias instaladas, base de datos y R2 configurados, migraciones de publicación aplicadas y una cuenta de Instagram con permiso de publicación. Ejecutar los comandos desde la raíz del proyecto. No hace falta desplegar para esta prueba; sí mantener la computadora, la app, el túnel y el worker activos.

### 1. Preparar ngrok una sola vez

Instalar ngrok siguiendo su [guía oficial](https://ngrok.com/docs/start) e iniciar sesión en su dashboard. Asociar el agente a la misma cuenta:

```sh
ngrok config add-authtoken "TU_AUTHTOKEN_DE_NGROK"
```

El authtoken de ngrok y el secreto de nuestro worker son credenciales distintas. No copiarlos a las historias ni al repositorio.

Si aparece `ERR_NGROK_15013`, solicitar el dominio de desarrollo en [Domains](https://dashboard.ngrok.com/domains) de esa cuenta antes de iniciar el túnel; no usar un dominio inventado.

### 2. Arrancar la app y el túnel

Terminal 1:

```sh
npm run dev
```

Este recorrido usa HTTP local en el puerto 3000. Si ya hay otro servidor ocupándolo, detenerlo para que Next y ngrok apunten al mismo puerto. No usar `dev:https` para estos comandos.

Terminal 2:

```sh
ngrok http 3000
```

Si hace falta indicar el dominio asignado explícitamente:

```sh
ngrok http 3000 --url=https://TU-DOMINIO-ASIGNADO
```

Copiar el origen HTTPS público que muestra ngrok. El túnel entrega las peticiones a `http://localhost:3000`.

### 3. Configurar el entorno y reiniciar

En `.env.local`, sustituir los marcadores por los valores del entorno:

```dotenv
RADAR_APP_URL="https://TU-DOMINIO-ASIGNADO"
INSTAGRAM_PUBLISH_WORKER_URL="http://127.0.0.1:3000"
INSTAGRAM_PUBLISH_WORKER_SECRET="TU_SECRETO_DE_WORKER"
```

Conservar el secreto existente si ya está configurado. Si falta, generar uno con `openssl rand -hex 32` y guardar el resultado únicamente como `INSTAGRAM_PUBLISH_WORKER_SECRET`. App y worker deben leer el mismo valor.

`RADAR_APP_URL` debe ser público: `https://localhost:3000` no permite a Meta descargar los archivos. La URL interna del worker evita que este dependa del túnel; si se omite `INSTAGRAM_PUBLISH_WORKER_URL`, el script usa `RADAR_APP_URL`, que también sirve con ngrok.

Reiniciar `npm run dev` después de guardar. Si hay que reconectar Instagram, registrar el callback exacto en la configuración de Meta antes de hacerlo:

```text
https://TU-DOMINIO-ASIGNADO/api/radar/meta/callback
```

Si cambia el origen del túnel, actualizar entorno y callback, reiniciar y revalidar el paquete para obtener enlaces de entrega del origen vigente.

### 4. Arrancar el worker

Terminal 3:

```sh
npm run worker:instagram
```

El script carga `.env.local` automáticamente mediante `@next/env`. El error `Configure INSTAGRAM_PUBLISH_WORKER_SECRET ...` indica que falta el secreto o una URL base; revisar sus nombres y reiniciar ambos procesos tras corregirlos. No hace falta exportar manualmente las variables en la terminal.

El worker puede avanzar órdenes pendientes ya autorizadas. Mantenerlo junto a la app y ngrok mientras dure la prueba.

### 5. Validar y publicar desde la interfaz

1. Abrir la app, verificar la cuenta destino y revalidar el candidato aprobado.
2. Abrir el `delivery file` vigente: debe servir el JPEG públicamente, sin login ni pantalla intermedia. No compartir ese enlace secreto en logs o historias.
3. Revisar el contenido y autorizar el envío con **Publish now**. Para un fallo seguro, usar **Retry publishing**; para una suspensión de autorización previa al envío, **Revalidate and retry publishing**, si la UI lo ofrece. No crear una publicación nueva para resolver un resultado incierto.
4. Comprobar el post en Instagram y el registro/enlace en la app. Un contenedor `FINISHED` no confirma publicación.
5. Ante HTTP 400, revisar el detalle saneado del proveedor y la accesibilidad del archivo; el código HTTP por sí solo no identifica la causa.

Detener los tres procesos con Ctrl+C al terminar. No depender de localhost/ngrok para horarios futuros: esa capacidad requiere el despliegue permanente de [PUB-11](../stories/PUB-11.md).

## Configuración

1. Aplicar las migraciones existentes `0057` y `0058` en la base del entorno. Estas correcciones no añaden migraciones. `npm run db:check` comprueba archivos de migración, no demuestra que estén aplicados en una base remota.
2. Configurar `INSTAGRAM_PUBLISH_WORKER_SECRET` con un secreto largo y aleatorio en la app y en el proceso worker. Es distinto de `RADAR_COLLECTOR_SECRET`; no debe exponerse al navegador.
3. Definir `INSTAGRAM_PUBLISH_WORKER_URL` con el origen de la app accesible al proceso. En local puede ser `http://127.0.0.1:3000`; en remoto usar HTTPS. Si se omite, se utiliza `RADAR_APP_URL`. No se aceptan redirecciones ni credenciales en la URL.
4. Mantener `RADAR_APP_URL` como el origen público HTTPS que sirve `/api/deliver/<token>` para Meta y los callbacks OAuth. Una URL interna del worker no vuelve públicas las imágenes.
5. Arrancar la app y ejecutar en otro proceso:

```sh
npm run worker:instagram
```

El script carga los archivos de entorno locales mediante `@next/env`, realiza pasadas secuenciales y espera cinco segundos entre ellas. No imprime secretos ni respuestas crudas. Debe ejecutarse bajo un supervisor del proveedor de hosting, systemd u otro gestor que lo reinicie tras una caída. En hosting exclusivamente serverless, configurar un scheduler externo que haga `POST /api/internal/instagram-publications/resume` con `Authorization: Bearer <INSTAGRAM_PUBLISH_WORKER_SECRET>` periódicamente. El repositorio no provisiona ni activa ese servicio.

Para una única pasada desde una tarea programada:

```sh
npm run worker:instagram -- --once
```

**Esta orden puede publicar trabajos previamente autorizados y pendientes.** Usar una base de pruebas para QA. El worker nunca crea una orden ni publica solo porque un draft esté aprobado. El secreto ausente deshabilita la ruta interna con 503; uno incorrecto devuelve 401.

## Límites y recuperación

- Hasta cuatro órdenes por pasada, priorizadas por su actualización más antigua. Cada orden ejecuta un paso acotado y persiste el resultado; no hay esperas ni recursión dentro de la ruta. El lease dura 150 segundos; la ruta admite hasta 120 segundos. El hosting debe soportar ese presupuesto o ajustarse antes de habilitar envíos.
- `INSTAGRAM_PUBLISH_MAX_ATTEMPTS`: 4 por defecto, rango 1–10. Solo se reinician fallos seguros o suspensiones `invalidated` de preflight con cero intentos y sin IDs de contenedor/media, mediante una acción explícita que identifica el job; se conserva el historial de contenedores anteriores.
- `INSTAGRAM_PUBLISH_MAX_MINUTES`: 30 minutos por defecto, rango 5–60. Limita la preparación y consulta de resultados inciertos por el inicio persistido de la orden. Si se agota, la orden queda suspendida.
- Un trabajo retomado en `publishing` nunca llama de nuevo a `media_publish`. `FINISHED` no prueba que el envío anterior haya fallado. Si Meta devuelve `PUBLISHED` pero no hay ID remoto guardado, queda una incidencia manual `suspended/uncertain`; no se usa el ID del contenedor como ID del post ni se buscan coincidencias por texto o fecha. No existe aún una UI de resolución de estas incidencias.
- Un ID remoto guardado habilita exclusivamente reparación local: registro del post, vínculo de origen y consumo del paquete. Puede recuperarse incluso con la cuenta desconectada o el paquete vencido. Una corrección o desvínculo manual no se sobreescribe. El estado final `published` se escribe al completar el registro; la ausencia del permalink no lo bloquea.
- Las reparaciones locales pendientes siguen siendo elegibles hasta completarse; requieren supervisar errores persistentes de base de datos. Los intentos de conseguir el permalink son de mejor esfuerzo y solo continúan dentro de la ventana configurada desde la confirmación.

## Pruebas locales sin publicar

```sh
npm test
npm run lint
npm run build
npm run db:check
```

Las pruebas usan dependencias simuladas y PostgreSQL en memoria. Cubren concurrencia, idempotencia, reintentos explícitos, interrupciones, pérdida/caducidad de lease, cambios de autorización y recuperación tras fallos locales. No contactan Meta ni la base configurada de la aplicación.

## QA real restante

- En una base y cuenta de pruebas, validar candidato, congelar y abrir la URL pública de entrega sin autenticación. Confirmar el JPEG 1080×1350 y el caption/orden de imágenes.
- Con autorización explícita para cada publicación, probar una foto y un carrusel, cerrar el navegador después de enviar la orden y comprobar que el worker completa el registro.
- Reiniciar el proceso worker durante preparación y comprobar que retoma la misma orden. No provocar un reenvío de una incidencia incierta.
- Confirmar un solo post en galería e historia, el paquete exacto y su versión; volver a sincronizar y verificar que no hay duplicados. Corregir o eliminar un vínculo manualmente y comprobar que una reparación posterior lo respeta.
- Comprobar el acceso público de entrega, las migraciones aplicadas, el presupuesto de ejecución del hosting y la supervisión/reinicio del worker antes de considerar el MVP listo.

Un mensaje de autorización guardado en una orden antigua no se borra al validar el candidato. Cuando la suspensión ocurrió antes de cualquier operación de proveedor, el panel ofrece **Revalidate and retry publishing**. Ese clic autoriza el reintento sobre la misma orden y vuelve a comprobar la identidad, el paquete, los permisos y las aprobaciones actuales. Suspensiones con actividad de proveedor o resultados inciertos no usan esta excepción.
