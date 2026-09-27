# Feature: Conexión, publicación y automatización en Meta

**ID:** FEAT-PUB-001

**Estado:** Base de Instagram implementada con QA pendiente; ampliación Meta especificada, por implementar.

**Actualización:** 26 de septiembre de 2026

**Producto:** Press Craftor

**Tablero:** [Publicación desde el SaaS](instagram-publishing.kanban.md)

## Objetivo

Gestionar Facebook e Instagram desde Press Craftor: conectar destinos de un Topic, ver un preview después de generar el draft, revisar la publicación, enviarla ahora o programarla, conservar el historial y vincular automáticamente cada post confirmado con su Story y versión exacta.

Las Stories mantienen el modelo editorial compartido y pueden proceder de cualquier fuente. Una Story puede generar varias publicaciones en distintos destinos y momentos. Las conexiones pertenecen al Topic; las Editorial Lines configuran el workflow dentro de sus permisos.

Se amplía FEAT-PUB-001 y se conserva la numeración PUB existente. Las fichas enlazadas contienen los criterios de aceptación; los avances históricos no representan implementación de las ampliaciones del 26 de septiembre.

## Base existente comprobada en el repositorio

| Capacidad | Base | Situación de esta ampliación |
|---|---|---|
| Conexión directa a Instagram | IG-01, PUB-02; `meta/connect` usa Instagram Login | Añadir Facebook Login for Business y selección de Página/Instagram |
| Candidatura, validación y paquete inmutable | PUB-01 a PUB-03 | Reutilizar y extender a variantes por destino |
| Envío y recuperación de Instagram | PUB-04 y PUB-07; paquetes y jobs persistidos | Adaptar al contrato común y añadir Facebook Pages |
| Registro y vínculo de post propio | PUB-06; `topic_instagram_media` conserva paquete y vínculo | Completar resumen y marca automática de Story; cubrir ambos destinos |
| Galería, vínculo manual y métricas | IG-02 a IG-06 | Dar paridad a Facebook sin duplicar el pipeline |
| Seguimiento de distribución | `story_social_publications`, una fila por Topic/Story/plataforma | Conservar como resumen; añadir historial de entregas independiente |
| Worker externo | Script y workflow de Instagram, PUB-11 | Acreditar operación permanente, cadencia, alarmas y recuperación |
| Sesiones y aislamiento | Rutas Meta aún usan `authorizeRadarCollector` | AUTH-04/05/06 son requisito para habilitar la experiencia de clientes |
| Calendario y autonomía | PUB-05 planificada; aprobación humana vigente | Implementar scheduler y modos explícitos de PUB-16/PUB-17 |

Puntos de referencia: [conexión actual](../../src/app/api/radar/topics/[topicId]/meta/connect/route.ts), [publicación y reparación](../../src/app/modules/meta/publish-publication-package.ts), [resumen de distribución](../../src/db/schema/story-social-publications.ts) y [lector actual del resumen](../../src/app/modules/stories/social-publications.repository.ts).

## Recorrido del usuario

1. En el Topic, elegir **Conectar Meta**, autorizar mediante Facebook y seleccionar una Página y, si corresponde, su Instagram profesional vinculado. **Conectar solo Instagram** continúa disponible.
2. Generar un draft. Al terminar aparece el **preview de publicación**, con una pestaña por destino, la revisión exacta y cualquier asset o validación pendiente.
3. Revisar texto, imágenes, orden, atribuciones, cuentas y variantes por plataforma. Un preview pendiente de aprobación todavía no permite enviar.
4. Elegir **Aprobar y publicar** o **Aprobar y programar**, con fecha, hora y zona visibles. Si ya existe una aprobación vigente del mismo paquete, se utiliza sin otra aprobación editorial redundante; la autorización de envío sigue siendo explícita.
5. Seguir los estados independientes de Facebook e Instagram. Cerrar el navegador no detiene una orden autorizada.
6. Tras confirmar Meta el post, registrar automáticamente el ID, vínculo, paquete y fecha real. La Story muestra dónde está publicada y su historial sin exigir un enlace manual.

El MVP visual mantiene fotos y conjuntos de imágenes. Instagram utiliza foto/carrusel; Facebook necesita la composición admitida por su API y mostrada en su propio preview. Reels, Instagram Stories, anuncios, mensajes, comentarios y edición/borrado remoto no forman parte de esta ampliación inicial. El video conserva su [feature existente](video-draft.md).

## Modelo de publicación y trazabilidad

`Story → revisión de draft → preview → paquete por destino → orden → entregas → confirmaciones → post/vínculo/estado de Story`

- Una orden registra la acción autorizada y sus destinos; cada entrega conserva cuenta, paquete, revisión de conexión, horario, actor/política, intentos e IDs del proveedor.
- El paquete contiene el contenido aprobado y snapshots de evidencia, marca y assets. Retrying no reconstruye lo publicado desde el draft mutable.
- La confirmación remota es un hecho durable. La galería y los resúmenes se reparan a partir de ella si falla la escritura local.
- Un post tiene identidad por plataforma + cuenta/página + ID remoto; URL y caption son referencias, no claves de deduplicación.
- La Story admite varias publicaciones. El vínculo editorial actual puede corregirse; el origen histórico de una entrega propia y su paquete se conservan.
- Una republicación explícita genera otra orden. Un reintento o una sincronización no la genera.
- La migración preserva paquetes, jobs y artefactos existentes de Instagram. PUB-13 define el límite de compatibilidad; no exige reemplazar el motor editorial.

## Estados y significado de «publicada»

Son estados de entrega propuestos; no son enums ya migrados. El estado editorial del draft y el estado de distribución se conservan por separado.

| Estado | Significado y acción |
|---|---|
| Preview / requiere revisión | Se puede revisar el contenido; no hay autorización de envío |
| Lista para publicar | Paquete vigente y destino habilitado, todavía sin orden de envío |
| Programada | Paquete, cuenta y horario autorizados; a la espera del scheduler |
| En cola / preparando | Worker prepara la entrega y los medios |
| Publicando | Operación remota irreversible en curso |
| Pendiente de confirmación | Resultado incierto; reconciliar antes de considerar otro envío |
| Publicada; registro local pendiente | ID de post confirmado; reparar vínculo/proyecciones sin reenviar |
| Publicada | Post confirmado y registro local completado |
| Fallida | Error conocido con indicación de reintento seguro o intervención |
| Suspendida | Permiso, aprobación, política, cuenta o tolerancia de horario dejaron de ser válidos |
| Cancelada | Cancelación aceptada antes del envío irreversible |

**Marca de Story:** al menos una publicación confirmada y vinculada en ese Topic la hace visible como publicada. Mostrar «Publicada en Instagram · Facebook programado/fallido» cuando corresponda. «Publicada en ambos» requiere confirmación de ambos; no se infiere del envío ni de un contenedor terminado.

**Estado de la orden:** conservar todos los destinos inicialmente autorizados. Uno publicado y otro fallido/programado/cancelado se presenta como resultado parcial, con el detalle correspondiente. La orden solo completa todos los envíos cuando cada destino requerido está confirmado.

El indicador se calcula desde el historial y el vínculo vigente, conservando el origen propio o externo verificado. No reescribir `stories.published_at` (fecha de la fuente), la aprobación de un nuevo draft ni el estado de otro Topic. Filtros, contadores e historial usan la misma proyección. Una publicación histórica no desaparece porque la Story deje de estar aprobada o la cuenta se desconecte.

## Programación y calendario

El alcance base permite elegir fecha/hora para publicar en Facebook e Instagram **desde el calendario de Press Craftor**. Se fija zona IANA, instante UTC, destinos, paquetes y autorización. Puede elegirse la misma hora o una diferente por destino.

Un scheduler durable ejecuta el envío cuando corresponde y registra hora prevista y real. Las URLs y contenedores temporales se preparan cerca de la entrega; el snapshot aprobado y sus archivos se retienen durante toda la programación y según la política de historial.

Cancelar, reprogramar y «Publicar ahora» compiten de forma atómica con el worker. Si el envío remoto ya comenzó, la UI indica que debe confirmarse el resultado. Definir tolerancia de retraso y suspender al excederla. La cadencia del scheduler debe ser compatible con la precisión ofrecida.

**Meta Business Suite:** este alcance no promete que las órdenes aparezcan en su calendario. Un futuro modo de programación nativa exige verificar APIs por plataforma, persistir el ID remoto y resolver edición/cancelación y reconciliación. La app y Meta no pueden ejecutar simultáneamente el mismo envío programado. No extrapolar capacidades de Facebook Pages a Instagram.

## Automatización y aprobación

| Modo | Qué se automatiza | Autorización de publicación |
|---|---|---|
| Manual | Preview y validaciones; el editor decide la entrega | Paquete y destinos explícitos en cada orden |
| Supervisado — PUB-16 | Generación terminada → preparar preview; tras aprobación, enviar/programar, vincular y actualizar historial | Aprobación humana final y elección de entrega |
| Autónomo opcional — PUB-17 | Tras generar y validar, preparar preview conservado y publicar/programar según política | Política explícita de Topic **y** workflow, gates, cuentas, límites, horario y auditoría |

La aprobación humana sigue siendo obligatoria en el flujo actual. PUB-17 especifica una capacidad futura, deshabilitada por defecto; redactar estas historias no la activa. El preview existe en todos los modos. Generar solo texto o tener assets sin validar no basta para publicar.

Los workflows reanudan desde salidas persistidas. Un evento de generación repetido no repite llamadas pagadas, aprobaciones ni entregas. Los gates factuales y de marca pueden bloquear tanto publicación manual como automática; ante incertidumbre, el modo autónomo deriva a revisión. Incluir pausa, cuotas, simulación y recorrido de corrección.

## Autorización y control operativo

- AUTH-04, AUTH-05 y AUTH-06 proporcionan sesión, workspace y validación de Topic. Owner/admin configura conexiones; las acciones editoriales/publicación comprueban el permiso del actor y su alcance.
- El callback OAuth conserva un intento de un solo uso asociado a actor/sesión, workspace, Topic y mecanismo. No aceptar activos arbitrarios enviados por el cliente.
- Secretos y tokens permanecen en servidor. El worker ejecuta órdenes ya autorizadas bajo identidad de servicio y vuelve a comprobar su vigencia.
- Cada destino tiene capacidad separada de conectar, sincronizar, publicar y consultar métricas. Cambiar la cuenta no redirige órdenes; revocar acceso suspende las entregas afectadas.
- Idempotencia y leases cubren doble clic, concurrencia, reintentos y reinicios. No se promete exactamente un envío remoto ante cualquier fallo de red: los resultados inciertos se conservan y reconcilian sin reenvío ciego.
- La auditoría incluye actor, revisión, política, aprobación, destino, paquete, intentos, horario y respuesta saneada. Un post confirmado nunca se publica otra vez para reparar su vínculo.

## Historias y entregas

| ID | Entrega | Estado del alcance |
|---|---|---|
| [PUB-01](../stories/PUB-01.md) | Identificar candidaturas y bloqueos | Base Instagram en QA |
| [PUB-02](../stories/PUB-02.md) | Verificar capacidad de publicar | Base Instagram en QA |
| [PUB-03](../stories/PUB-03.md) | Congelar el paquete aprobado | Base Instagram en QA |
| [PUB-04](../stories/PUB-04.md) | Publicación inmediata de Instagram | Base Instagram en QA |
| [PUB-05](../stories/PUB-05.md) | Calendario, programación, adelanto, cancelación y reprogramación por destino | Ampliada, P0 |
| [PUB-06](../stories/PUB-06.md) | Vincular posts propios y marcar la Story publicada automáticamente | Base parcial; ampliada, P0 |
| [PUB-07](../stories/PUB-07.md) | Evitar duplicados y reconciliar incertidumbre | Base Instagram en QA; reutilizar |
| [PUB-08](../stories/PUB-08.md) | QA del recorrido completo y matriz Meta | QA continua; matriz ampliada |
| [PUB-09](../stories/PUB-09.md) | Conectar Meta, seleccionar Página/Instagram y verificar capacidades | Ampliada, P0 |
| [PUB-10](../stories/PUB-10.md) | Publicar en Facebook, Instagram o ambos | Ampliada, P0 |
| [PUB-11](../stories/PUB-11.md) | Desplegar, supervisar y recuperar workers | Base parcial; ampliada, P0 |
| [PUB-12](../stories/PUB-12.md) | Historial, estados por destino y acciones de control | Ampliada, P0 |
| [PUB-13](../stories/PUB-13.md) | Contrato compartido de destinos, paquetes, órdenes y entregas | Nueva, P0 |
| [PUB-14](../stories/PUB-14.md) | Preview después del draft y aprobación/envío desde una pantalla | Nueva, P0 |
| [PUB-15](../stories/PUB-15.md) | Sincronizar posts externos y vincular/corregir Stories | Nueva, P0 |
| [PUB-16](../stories/PUB-16.md) | Automatización supervisada de preparación y continuación | Nueva, P1 |
| [PUB-17](../stories/PUB-17.md) | Autonomía opcional con política, gates y límites | Nueva, P1; backlog hasta cumplir gates |
| [PUB-18](../stories/PUB-18.md) | Paridad de métricas básicas por publicación | Nueva, P1 |

Las dependencias precisas están en cada ficha. Orden sugerido:

1. **Fundamentos:** AUTH-04/05/06 para clientes; PUB-13, luego PUB-09. Trabajar con adaptadores simulados antes de habilitar cuentas externas.
2. **Recorrido inmediato:** PUB-14 → PUB-10 → ampliación PUB-06. PUB-15 parte de la conexión y habilita históricos; PUB-12 reúne el historial. PUB-11 prepara operación permanente.
3. **Programación:** PUB-05 una vez acreditado PUB-11 y las entregas por destino.
4. **Automatización supervisada:** PUB-16 usa el mismo preview y las mismas órdenes.
5. **Extensiones:** PUB-18 incorpora resultados básicos; PUB-17 se habilita solo después de validar el modo supervisado y sus controles adicionales.
6. **QA por fase:** PUB-08 prueba cada capacidad antes de habilitarla. Las funciones opcionales no bloquean el recorrido manual ya validado.

## Criterio de cierre del recorrido principal

Una Story generada permite ver el preview exacto, aprobar y enviar/programar a los destinos elegidos. El proceso continúa con la app cerrada. Cada post confirmado aparece una sola vez en historial y galería, vinculado automáticamente al paquete y a la Story, que muestra su distribución real. Un fallo parcial o local puede recuperarse sin repetir un post exitoso.

Conservar pruebas de sesión/Topic, revisión concurrente, permisos parciales, dos workers, timeout, éxito remoto con fallo local, DST, caducidad, reprogramación/cancelación concurrente y vínculos manuales. El código futuro debe usar UXDSL y pasar pruebas afectadas, lint/build y db:check para esquema. Una prueba real requiere autorización para su contenido y destinos.

## Referencias de Meta y verificación de capacidades

Consultado el 26 de septiembre de 2026:

- [Instagram mediante Facebook Login, colección oficial de Meta](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login): requiere un Instagram profesional vinculado a una Página para ese mecanismo.
- [Instagram Login directo, colección oficial de Meta](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login): alternativa sin Página vinculada.
- [Selección de páginas y tokens de Página, colección oficial de Meta](https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage): identidad de páginas accesibles y autorización asociada.

La lectura directa de la guía de Facebook Pages no estuvo disponible durante esta revisión. PUB-09/PUB-10 exigen verificar permisos, formatos, límites y versión al implementar; no se dan por acreditados soporte de programación nativa o equivalencia de formatos por compartir proveedor.

## Evidencia histórica preservada

**9 de septiembre de 2026:** el usuario confirmó conexión y publicación de Instagram en local mediante ngrok. No quedó registrado aquí un ID/permalink ni el formato; no cierra toda la QA. [Alcance de la evidencia](../stories/PUB-08.md#prueba-real-confirmada-con-ngrok--9-de-septiembre-de-2026) y [guía local](instagram-publishing-worker.md#ejecutar-en-localhost-con-ngrok).

**PUB-01:** implementada la evaluación de candidaturas en servidor y su panel en los recorridos creativos. La verificación puntual no crea una orden. El bloqueo inicial por PUB-02 y su evolución constan en [la ficha](../stories/PUB-01.md).

**25 de septiembre de 2026:** añadidos diagnóstico de entorno y disparador externo del worker; los pendientes de despliegue están fechados en [PUB-11](../stories/PUB-11.md). La documentación de esta ampliación no ejecuta migraciones, cambia credenciales ni publica contenido.
