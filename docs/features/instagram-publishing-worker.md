# Operación y pruebas de publicación inmediata

El envío utiliza órdenes persistidas en PostgreSQL y un worker independiente. `after()` y el polling del panel aceleran el progreso; el worker retoma los trabajos aunque el navegador esté cerrado o el servidor haya reiniciado. No programa publicaciones futuras: PUB-05 sigue pendiente.

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

## QA real pendiente

- En una base y cuenta de pruebas, validar candidato, congelar y abrir la URL pública de entrega sin autenticación. Confirmar el JPEG 1080×1350 y el caption/orden de imágenes.
- Con autorización explícita para cada publicación, probar una foto y un carrusel, cerrar el navegador después de enviar la orden y comprobar que el worker completa el registro.
- Reiniciar el proceso worker durante preparación y comprobar que retoma la misma orden. No provocar un reenvío de una incidencia incierta.
- Confirmar un solo post en galería e historia, el paquete exacto y su versión; volver a sincronizar y verificar que no hay duplicados. Corregir o eliminar un vínculo manualmente y comprobar que una reparación posterior lo respeta.
- Comprobar el acceso público de entrega, las migraciones aplicadas, el presupuesto de ejecución del hosting y la supervisión/reinicio del worker antes de considerar el MVP listo.

Un mensaje de autorización guardado en una orden antigua no se borra al validar el candidato. Cuando la suspensión ocurrió antes de cualquier operación de proveedor, el panel ofrece **Revalidate and retry publishing**. Ese clic autoriza el reintento sobre la misma orden y vuelve a comprobar la identidad, el paquete, los permisos y las aprobaciones actuales. Suspensiones con actividad de proveedor o resultados inciertos no usan esta excepción.
