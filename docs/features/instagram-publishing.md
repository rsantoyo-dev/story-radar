# Feature: Publicación de Instagram desde el SaaS

**ID:** FEAT-PUB-001  
**Estado:** En revisión local — PUB-01 a PUB-04 y PUB-07 en QA. PUB-04 incluye worker independiente y recuperación del registro; PUB-06 conserva pendientes de compatibilidad y QA, PUB-08 requiere validación real. PUB-05 (programación) sigue pendiente. [Configuración del worker y pruebas](instagram-publishing-worker.md).
**Producto:** Press Craftor  
**Tablero:** [instagram-publishing.kanban.md](instagram-publishing.kanban.md)

## Objetivo

Convertir un conjunto creativo aprobado en una publicación enviable a Instagram, publicar desde el SaaS y conservar automáticamente el vínculo entre post, historia y versión exacta utilizada. La programación se entrega después de la publicación inmediata.

IG-07 e IG-08 de rendimiento quedan aplazadas mientras crece el MVP. La nueva feature aprovecha IG-01 a IG-06, pero no depende de capturas periódicas de métricas ni de comparaciones. Programar publicaciones es una capacidad distinta de sincronizar analítica.

## Decisión de producto

Aprobar habilita una candidatura; no publica. **“Lista para publicar”** identifica el paquete aprobado y validado. “Publicar ahora” autoriza un envío inmediato y “Programar” autoriza el envío de ese mismo paquete en la fecha elegida. No se añade una aprobación intermedia al recorrido documental: se conserva su revisión final y después se elige la acción de entrega.

La selección de destino y hora no permite reescribir la pieza aprobada. Cambiar contenido crea otra revisión. La UI puede reunir “Aprobar y publicar” o “Aprobar y programar” en una acción claramente identificada en el futuro, pero nunca interpretar el botón actual de aprobación como autorización de publicación.

## Estados de entrega propuestos

Estos estados pertenecen a una intención de publicación, separada del estado del draft. Son nombres de dominio propuestos, no migraciones implementadas.

| Estado | Significado |
|---|---|
| Candidata | Conjunto aprobado, con comprobaciones de entrega pendientes. |
| Lista para publicar | Paquete vigente y destino habilitado; sin envío autorizado todavía. |
| Programada | Envío futuro autorizado para un paquete, cuenta y fecha concretos. |
| Preparando envío | Worker reclamó la intención y prepara archivos/contenedores. |
| Publicando | Solicitud de publicación en curso. |
| Pendiente de confirmación | Resultado remoto incierto; no volver a enviar a ciegas. |
| Publicada | Meta confirmó publicación; se conserva ID remoto y vínculo editorial. |
| Fallida | Error conocido; se indica si admite reintento. |
| Suspendida | Aprobación, permisos, cuenta o condiciones dejaron de ser válidos. |
| Cancelada | Se canceló antes de que el envío fuese irreversible. |

Una intención publicada permanece histórica. Una nueva versión o una republicación deliberada crea otra intención, no reescribe la anterior.

## Meta: publicación y programación

La documentación consultada del proveedor describe creación de contenedores y `media_publish`, además de estados para comprobar su resultado. Los contenedores expiran si no se publican dentro de su ventana de vigencia. **No se ha identificado una operación documentada que programe publicaciones de Instagram en el calendario de Meta Business Suite desde este flujo de API.** No se extrapolan parámetros de programación de Facebook Pages a Instagram.

Por ello, el diseño usa programación propia: persistir la orden en el SaaS y ejecutar la API de Instagram cuando corresponda. No se ofrece sincronización bidireccional con Business Suite ni recomendación automática de la mejor hora en este MVP. Los límites y formatos se verifican contra la versión desplegada antes de habilitar el conector.

Referencias consultadas el 6 de septiembre de 2026: [publicación y estados de contenedores, colección oficial de Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-ab559ffb-8e2c-4b0a-b43a-5737b6d2f672) y [Instagram Login y permiso de publicación](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-f83ffcaa-55ed-4357-932d-3a61ccbc084a).

## Entregas

| Entrega | Historias | Resultado |
|---|---|---|
| MVP inmediato | PUB-01 a PUB-04 y PUB-06 a PUB-08 | Publicar foto/carrusel aprobado, con recuperación y vínculo automático. |
| Programación | PUB-05 y validación correspondiente de PUB-08 | Elegir fecha y hora dentro del SaaS. |

No incluye reels, Stories, Facebook Pages, edición de publicaciones remotas, borrado remoto, anuncios, mejor hora calculada ni sincronización del calendario de Business Suite. No se habilitan credenciales ni se ejecutan publicaciones al redactar esta propuesta.

## Historias

### PUB-01 — Identificar publicaciones listas para publicar

**Ficha:** [PUB-01](../stories/PUB-01.md)

**Como** editor, **quiero** identificar publicaciones listas para publicar, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** IG-01 a IG-06 como base existente

**Criterios de aceptación**

- La aprobación vigente del texto y de todas las imágenes seleccionadas hace que el conjunto sea candidato. En el recorrido documental se utiliza su aprobación final conjunta; aprobar solo el guion nunca basta.
- El servidor determina “Lista para publicar” mediante un snapshot del conjunto exacto, política vigente, evidencia, permisos de uso, archivos accesibles y destino configurado. Muestra los motivos que impiden habilitarlo.
- Crear la candidatura no envía contenido a Meta ni agenda una publicación. Cada cambio al texto público, selección de assets o destino exige revalidación y, si modifica el contenido aprobado, nueva aprobación.
- Los borradores y publicaciones existentes conservan su historial. El estado de entrega pertenece a una intención de publicación y no sustituye el estado editorial del draft.

### PUB-02 — Verificar la capacidad de publicar de la cuenta

**Ficha:** [PUB-02](../stories/PUB-02.md)

**Como** editor, **quiero** verificar la capacidad de publicar de la cuenta, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-01

**Criterios de aceptación**

- La configuración verifica instagram_business_content_publish para Instagram Login y los requisitos de acceso de la aplicación en la versión elegida. No se considera que insights operativo implique permiso de publicación.
- La UI distingue cuenta desconectada, reconexión necesaria, permiso de publicación ausente y cuenta habilitada. Nunca publica un post de prueba para verificar acceso sin una orden explícita.
- Cada intención fija el ID de cuenta, tema y revisión de conexión. Cambiar de cuenta no redirige trabajos pendientes; reconectar exige comprobar que sigue siendo la misma cuenta y que el trabajo continúa autorizado.
- Las credenciales y llamadas viven en servidor. Una capacidad ausente bloquea el envío con un motivo y conserva el borrador listo editorialmente.

### PUB-03 — Congelar y preparar el paquete aprobado

**Ficha:** [PUB-03](../stories/PUB-03.md)

**Como** editor, **quiero** congelar y preparar el paquete aprobado, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-01, PUB-02

**Criterios de aceptación**

- Antes del envío se conservan texto público exacto, orden de slides, IDs y versiones de cada asset, hashes, snapshot de guion, política y evidencia de aprobación. Un ID de draft mutable no basta para reproducir lo publicado.
- El MVP admite foto y carrusel de imágenes 4:5. Se validan dimensiones, peso, formato y cantidad de slides según la API desplegada. La conversión técnica a JPEG conserva encuadre, texto, atribuciones y originales; no se utiliza generación de imágenes.
- Meta obtiene únicamente los archivos de publicación mediante URLs de entrega accesibles para sus servidores y de vigencia suficiente. No se publica el bucket, referencias privadas, secretos ni claves de almacenamiento.
- El paquete derivado se identifica por hash y se muestra en la revisión de envío. No se modifica silenciosamente el caption, sus hashtags, el orden o la representación aprobada.
- Las transformaciones necesarias para publicar se incorporan a la vista revisada; si alteran el contenido más allá de la codificación técnica autorizada, el paquete vuelve a revisión.

### PUB-04 — Publicar ahora desde el SaaS

**Ficha:** [PUB-04](../stories/PUB-04.md)

**Como** editor, **quiero** publicar ahora desde el SaaS, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-03, PUB-07

**Criterios de aceptación**

- “Publicar ahora” presenta cuenta, pieza, texto y conjunto exactos. La acción explícita autoriza ese envío; la aprobación editorial sola no lo inicia.
- El servidor vuelve a comprobar la autorización y vigencia, crea los contenedores correspondientes, espera su disponibilidad y ejecuta media_publish. Se conserva cada ID de proveedor y transición.
- En carruseles se respeta el orden congelado y se envía un único post. No se publican slides sueltos como alternativa ante un fallo.
- La UI distingue preparando, publicando, pendiente de confirmación, publicado y fallido. Un contenedor terminado no equivale a una publicación confirmada.
- El trabajo persiste y puede continuar aunque el editor cierre el navegador. Ningún endpoint depende de una pestaña abierta ni mantiene un sleep hasta completar el proceso.

### PUB-05 — Programar y cancelar una publicación

**Ficha:** [PUB-05](../stories/PUB-05.md)

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

### PUB-06 — Registrar y vincular automáticamente la publicación

**Ficha:** [PUB-06](../stories/PUB-06.md)

**Como** editor, **quiero** registrar y vincular automáticamente la publicación, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-04

**Criterios de aceptación**

- Al confirmar el ID de media publicado se hace upsert del post en topic_instagram_media, aislado por tema y cuenta, con permalink cuando esté disponible, fecha y vínculo a la historia.
- El vínculo conserva draft, revisión, lote y selección exacta de versiones de assets, además del paquete congelado. Queda visible en la galería y los resultados de la historia sin búsqueda por similitud.
- La sincronización posterior de IG-02 deduplica por identidad remota y no borra la trazabilidad del envío ni una corrección manual posterior. Los trabajos publicados no reaplican vínculos que el editor corrigió.
- Una historia admite varias publicaciones. Se conserva el seguimiento story_social_publications existente como resumen compatible; su unicidad por historia/plataforma no limita ni reemplaza el historial de entregas individuales.
- Si Meta publicó pero falló la escritura local, se recupera el vínculo por el ID remoto registrado y la intención. Nunca se vuelve a publicar para reparar una asociación local.
- La ausencia temporal del permalink no oculta una publicación confirmada por ID. La actualización del enlace y metadatos puede completarse después.

### PUB-07 — Evitar duplicados y reconciliar resultados inciertos

**Ficha:** [PUB-07](../stories/PUB-07.md)

**Como** editor, **quiero** evitar duplicados y reconciliar resultados inciertos, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-03

**Criterios de aceptación**

- Cada orden tiene ID idempotente persistido y una clave para el paquete, cuenta y acción. Doble clic, dos workers y reintentos de red no crean automáticamente intenciones nuevas.
- Los workers reclaman trabajos con bloqueo o lease y versión; las transiciones son condicionales. Una respuesta antigua no sobrescribe una cancelación, reprogramación o decisión nueva.
- Un timeout después de media_publish pasa a “Pendiente de confirmación”. Se consulta el estado del contenedor y se reconcilia antes de reintentar una operación potencialmente publicada; no se promete exactly-once remoto.
- Se diferencian fallos seguros para reintentar, errores de permisos, límites de API, contenedores expirados y resultados inciertos. Reintentos, consultas, coste y tiempo son acotados y configurables.
- No se marca “Publicado” por texto parecido, por fecha cercana ni por contenedor listo. Si no puede recuperarse un resultado cierto, se conserva la incidencia para resolución explícita sin un nuevo envío automático.
- Se verifica el límite disponible de publicación de la cuenta; se registran errores saneados y métricas operativas, sin tokens ni URLs de entrega secretas en el navegador o logs.

### PUB-08 — Validar publicación y trazabilidad de extremo a extremo

**Ficha:** [PUB-08](../stories/PUB-08.md)

**Como** editor, **quiero** validar publicación y trazabilidad de extremo a extremo, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-04, PUB-06, PUB-07

**Criterios de aceptación**

- Pruebas cubren aprobación parcial, versión editada, permiso ausente, cuenta sustituida, doble clic, workers concurrentes, timeout antes y después del envío y fallo de persistencia tras éxito remoto.
- Se verifica que un envío confirmado aparece una sola vez en galería e historia, asociado a su snapshot exacto, incluso tras sincronizar de nuevo o editar el draft actual.
- Para PUB-05 se añaden pruebas de zona horaria, cambio horario, caducidad, cancelación concurrente, reprogramación, retraso y pérdida de vigencia. No son requisito para entregar solamente “Publicar ahora”.
- Las pruebas de integración públicas requieren una cuenta de prueba y autorización explícita para cada publicación de validación. La documentación de esta feature no autoriza publicar contenido real.
- La UI usa UXDSL, la paleta del proyecto y sus breakpoints. Pasan pruebas relevantes, TypeScript, lint, build y db:check si hay cambios de esquema; los bloqueos se documentan.
- El despliegue de programación requiere scheduler/worker durable y observabilidad comprobados. Mientras falten se deshabilita “Programar”, manteniendo honesto el alcance disponible.

## Persistencia y decisiones técnicas pendientes

Reutilizar servicios de Meta, R2 privado, snapshots, versiones y relaciones de IG-04/06. Antes de implementar, definir la persistencia de intenciones y ejecuciones durables, claves de deduplicación y transiciones atómicas. Los snapshots completos son necesarios porque el contador de versión de un draft no conserva por sí solo su contenido antiguo.

No forzar múltiples entregas dentro de la fila única de `story_social_publications`. Definir su proyección de resumen (por ejemplo, última entrega confirmada) manteniendo registros individuales y sin hacer que sincronizar deshaga decisiones manuales. La restricción actual de fechas requiere contemplar “Publicar ahora” sobre una intención previamente programada para más tarde.

Elegir scheduler/cola conforme al despliegue real; verificar política de retrasos, TTL de entrega y acceso de Meta a archivos. No utilizar temporizadores del navegador ni workers en memoria como programación durable. La falta de infraestructura o permisos se refleja como capacidad no disponible.

## Avance de PUB-01 — 9 de septiembre de 2026

Implementada la evaluación de candidaturas en servidor y su panel en ambos recorridos creativos; véase [detalle y límites de PUB-01](../stories/PUB-01.md#implementación--9-de-septiembre-de-2026). La verificación es puntual y no crea una orden de envío. «Lista para publicar» sigue bloqueado por PUB-02; no hay publicación ni programación habilitadas.
