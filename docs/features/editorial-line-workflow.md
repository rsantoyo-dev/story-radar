# Feature: Flujo unificado de líneas editoriales y revisión de candidatos

**ID:** FEAT-ELW-001  
**Estado:** Completado  
**Fecha de cierre:** 2026-09-08  
**Tablero:** [editorial-line-workflow.kanban.md](editorial-line-workflow.kanban.md)  
**Feature base:** [Recolección por líneas editoriales](editorial-collection-lines.md)

## Resultado entregado

Cada marca utiliza una lista de líneas editoriales. Topics & Sources configura sus objetivos, periodos, feeds y búsqueda IA; Collection ejecuta una línea seleccionada. La recolección anterior queda representada por Actualidad, y las líneas temáticas existentes permanecen a su lado.

En el workspace editorial se pueden combinar línea y Shortlist only, revisar candidatos y conservar los vínculos a historias, borradores y publicaciones. La explicación del estado Review y su promoción recoge comportamiento existente verificado; no se atribuye a esta entrega un cambio del criterio de evaluación.

Este documento registra como completado el trabajo realizado en esta conversación. No declara completados trabajos futuros del feature base ni una validación integral de publicaciones que no se haya ejecutado.

## Recorrido disponible

1. Configurar líneas en Topics & Sources: Actualidad y las temáticas deseadas.
2. Elegir una en Collection; si solo existe una activa, queda seleccionada.
3. Añadir opcionalmente Research today y ejecutar Collect and save.
4. Evaluar candidatos con IA.
5. Filtrar por línea y, si corresponde, activar Shortlist only.
6. Aprobar candidatos de shortlist o usar Promote to selected para un candidato Review.
7. Continuar hacia el brief y borrador con su contexto conservado.

## Historias completadas

### ELW-01 — Configurar líneas editoriales dentro de cada marca

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** guardar objetivos editoriales independientes, **para** investigar actualidad, contexto y guías desde la misma marca.

**Tareas y resultado verificado**

- [x] Crear, editar, archivar y restaurar líneas con control de revisión.
- [x] Configurar nombre, objetivo, temas, modo, periodo y zona horaria.
- [x] Conservar configuración histórica y aislamiento por marca.

**Referencia:** [editorial-lines.repository.ts](../../src/app/modules/editorial-lines/editorial-lines.repository.ts).

### ELW-02 — Separar configuración y ejecución

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** configurar una vez y ejecutar desde Collection, **para** evitar formularios duplicados.

**Tareas y resultado verificado**

- [x] Mostrar la gestión de líneas únicamente en Topics & Sources.
- [x] Mostrar en Collection el selector, configuración efectiva y Research today opcional.
- [x] Actualizar el selector al guardar líneas, feeds o configuración IA de marca.
- [x] Conservar el periodo guardado en la línea; retirar su editor de Collection.

**Referencia:** [editorial-lines-panel.tsx](../../src/app/editorial-lines-panel.tsx).

### ELW-03 — Configurar feeds y búsqueda IA por línea

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** combinar fuentes RSS e investigación web, **para** adaptar la búsqueda a cada intención editorial.

**Tareas y resultado verificado**

- [x] Heredar feeds activos o seleccionar un subconjunto con exclusiones.
- [x] Permitir IA heredada, desactivada o personalizada por línea.
- [x] Personalizar instrucción, orientación, idioma, región, resultados, recuperación de contenido y prioridad.
- [x] Permitir una búsqueda IA personalizada aunque el valor predeterminado de marca esté desactivado.
- [x] Admitir feeds, IA o ambos; aplicar el periodo y los dominios de la línea.
- [x] Compartir proveedores, credenciales y presupuesto; validar opciones en servidor.

**Referencia:** [editorial-lines.ts](../../src/app/modules/editorial-lines/editorial-lines.ts).

### ELW-04 — Convertir la recolección predeterminada en Actualidad

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** tener todas las opciones de recolección como líneas, **para** usar un único modelo de colección.

**Tareas y resultado verificado**

- [x] Inicializar Actualidad al cargar las líneas o al recolectar por primera vez en una marca.
- [x] Asignar 72 horas, feeds e IA heredados; permitir editar su configuración.
- [x] Usar una identidad estable por marca para evitar duplicación concurrente.
- [x] Conservar líneas temáticas y cambios posteriores sin sobrescribirlos durante la inicialización.
- [x] Mantener la línea inicial disponible: puede editarse, pero no archivarse.
- [x] No reasignar retrospectivamente historias, borradores o publicaciones.

**Referencia:** [editorial-lines.repository.ts](../../src/app/modules/editorial-lines/editorial-lines.repository.ts).

### ELW-05 — Recolectar siempre desde una línea

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** escoger qué línea ejecutar, **para** obtener candidatos con una intención y periodo definidos.

**Tareas y resultado verificado**

- [x] Eliminar Existing brand collection del selector.
- [x] Seleccionar automáticamente cuando existe una sola línea activa.
- [x] Exigir elegir una línea cuando hay varias y deshabilitar Collect and save hasta entonces.
- [x] Ejecutar con consulta opcional, fuentes, IA y ventana efectivas de esa línea.
- [x] Asociar solicitudes antiguas sin lineId a Actualidad; conservar su ventana explícita en el snapshot.
- [x] Guardar contexto de ejecución y aplicar la cuota compartida de marca.

**Referencia:** [route.ts](../../src/app/api/radar/collect/route.ts).

### ELW-06 — Conservar contexto, fechas y vínculos

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** revisar por qué se encontró cada historia, **para** reutilizarla sin perder trazabilidad.

**Tareas y resultado verificado**

- [x] Aplicar la ventana editorial a resultados RSS e IA y respetar dominios permitidos.
- [x] Permitir material histórico pertinente en contexto sin presentarlo como última hora.
- [x] Guardar asociaciones de historia, línea y ejecución sin duplicar la historia canónica.
- [x] Conservar opciones IA efectivas, motivos y contexto de investigación.
- [x] Trasladar el contexto elegido a nuevos briefs y conservar el de borradores existentes.

**Referencia:** [collect-and-persist-story-candidates.ts](../../src/app/modules/stories/collect-and-persist-story-candidates.ts).

### ELW-07 — Filtrar la shortlist por línea editorial

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** combinar shortlist y línea editorial, **para** revisar únicamente los candidatos de la temática elegida.

**Tareas y resultado verificado**

- [x] Ubicar Filter stories by editorial line junto a la lista de historias.
- [x] Ofrecer todas las líneas, una línea concreta y Without a line para historias históricas.
- [x] Incluir líneas archivadas para consultar sus resultados anteriores.
- [x] Combinar Shortlist only con la línea seleccionada en Collected stories.
- [x] Aplicar el filtro de línea también a Selected stories.
- [x] Hacer que Select visible shortlist respete los filtros y mostrar selecciones ocultas.
- [x] Restablecer los filtros desde Reset filters sin modificar historias.

**Referencia:** [radar-dashboard.tsx](../../src/app/radar-dashboard.tsx).

### ELW-08 — Documentar y verificar Review y promoción editorial

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** entender por qué un candidato no tiene casilla de selección, **para** decidir si debe pasar a Selected.

**Tareas y resultado verificado**

- [x] Verificar que la casilla requiere evaluación shortlist, ausencia de revisión humana y ausencia de vínculo de duplicado.
- [x] Distinguir la relevancia de descubrimiento de la decisión posterior de evaluación.
- [x] Verificar Promote to selected para Review y Override to selected para Reject, con confirmación humana.
- [x] Conservar la decisión IA original al registrar la aprobación humana.
- [x] Confirmar en la API local que el artículo de Statistics Canada sobre patrimonio figuraba como review y reviewable=false.

**Referencia:** [story-editorial.repository.ts](../../src/app/modules/stories/story-editorial.repository.ts).

### ELW-09 — Corregir la vigencia del brief tras recargar su contexto

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** que el brief conserve su vigencia al abrirlo de nuevo, **para** continuar al carrusel sin repetir una actualización que ya tuvo éxito.

- [x] Normalizar el orden de campos del contexto para el hash, conservando compatibilidad con briefs guardados.
- [x] Verificar el round-trip JSONB con PostgreSQL en memoria, sin alterar el orden de arrays ni ignorar cambios reales de contexto.
- [x] Llevar el foco a los controles de draft tras actualizar correctamente el brief.
- [x] Mostrar progreso y errores junto a la acción de actualización.
- [x] Comprobar en localhost que el mismo brief de «Labour market experiences of recent immigrants, 2019 to 2025» pasa de obsoleto a vigente sin regeneración.

**Validación:** 475 pruebas pasan. La petición de refresh devolvió cached; el GET posterior al arreglo devuelve briefIsCurrent=true con el mismo ID.

### ELW-10 — Priorizar tensión sustentada y CTA concreto

**Estado:** Completada · **Prioridad:** P0

**Como** editor, **quiero** que el guion conecte con situaciones reconocibles, **para** generar identificación y conversación sin inventar emociones.

- [x] Aplicar una política compartida al brief, generación, auditoría y reescritura.
- [x] Priorizar avance/barrera cuando ambos estén sustentados y sean compatibles con el encuadre elegido.
- [x] Separar cohortes, denominadores, periodos y mediciones; no atribuir dos hallazgos a las mismas personas sin evidencia.
- [x] Evitar testimonios, emociones, causalidad o experiencias personales inventados.
- [x] Pedir progresión narrativa y resolución sin repetir cifras para completar slides.
- [x] Preferir preguntas experienciales concretas para el objetivo discussion, sin presuponer una vivencia negativa ni solicitar datos sensibles.
- [x] Mantener followers/saves/shares como acciones independientes; no cambiar el objetivo ni acumular CTA.
- [x] Detectar el fallback genérico «Síguenos para entender qué significa para ti cada novedad del tema» y preguntas abstractas de carrera.
- [x] Versionar los prompts: brief v27, meme v22 y carousel v38. Las versiones históricas se conservan.

**Ejemplo de enfoque:** «Encontrar trabajo en Canadá es un paso. Trabajar en lo tuyo es otro». Para un objetivo de conversación: «¿Tu primer trabajo en Canadá tenía algo que ver con tu profesión?». Estos ejemplos no se imponen a otras regiones o temas.

**Aplicación:** crear una nueva versión de brief/draft. El cambio no reescribe un guion ya guardado ni modifica automáticamente el objetivo de conversión de la marca. La calidad emocional del próximo resultado requiere revisión editorial; las pruebas no certifican una respuesta futura del modelo.

### ELW-11 — Distinguir conteos de listas y proporciones estimadas

**Estado:** Completada · **Prioridad:** P0

- [x] Corregir el falso positivo que asociaba «tres barreras» con «over 3 in 10».
- [x] Conservar las comprobaciones de cifras sin evidencia y de proporciones sin calificador.
- [x] Cubrir conteo legítimo, proporción sin calificador, porcentaje sin calificador y conteo no sustentado.
- [x] Verificar 478 pruebas satisfactorias; no modificar decisiones humanas ni tratar la indisponibilidad del crítico como revisión aprobada.

**Caso observado:** el crítico y la reescritura del draft no se ejecutaron por falta de créditos del proveedor. Es independiente del falso positivo numérico.

### ELW-12 — Separar expedientes municipales y preservar su estado

**Estado:** Implementada · **Prioridad:** P0

- [x] Añadir bloqueos de relaciones acción/ubicación apoyadas en extractos, incluso cuando una slide cita varios fact IDs.
- [x] Detectar propuestas presentadas como autorizaciones o cambios ejecutados.
- [x] Distinguir requisitos de estacionamiento de eliminación física de plazas.
- [x] Detectar impactos actuales, obligaciones y llamadas de inscripción no sustentados en este recorrido.
- [x] Usar extractos como evidencia: una ampliación del statement no valida una dirección adicional.
- [x] Reforzar extracción, generación y revisión: conservar encabezado, expediente, estado, lugar y horario; no representar geografía con imágenes inventadas.
- [x] Verificar 487 pruebas, lint y build.

**Corrección del piloto:** la versión 2 se conserva en el histórico. Tras detectar que la versión 3 repetía el plan anterior, se guardó mediante API autenticada la versión 4 del draft 3842be60-c45f-40ea-ba52-29fde510b502, en estado draft: cuatro unidades, vivienda separada de demolición y cierre con la consulta del 14 de septiembre. Sin aprobación automática. Se omiten localizaciones/horarios que no constan en los extractos del brief; no se completan datos desde otros expedientes.

**Prevención adicional:** los prompts del brief y borrador cambian de versión para invalidar cachés de generación anteriores. La generación debe reservar el cierre para la convocatoria cuando sea central; una advertencia detecta cierres cuya pregunta trata de participación pero cuyos facts omiten la consulta fechada. Esta advertencia no reescribe automáticamente el contenido.

**Límite:** las reglas deterministas reconocen patrones administrativos concretos, con cobertura probada del caso municipal en francés y términos adicionales en inglés/español. No constituyen una comprensión semántica universal ni certifican toda relación posible. Un lugar ausente del extracto debe recuperarse de la fuente o excluirse; no se geocodifica ni se completa por inferencia. Se conserva la revisión editorial.

## Evidencia de entrega y límites

- Suite de **474 pruebas** satisfactoria tras integrar inicialización de Actualidad, compatibilidad y configuración IA por línea.
- **Lint y build** satisfactorios también después del ajuste final de shortlist.
- Las pruebas incluyen persistencia y revisiones con PostgreSQL en memoria, aislamiento, ventanas temporales, opciones IA y separación del formulario de configuración.
- Consulta autenticada a localhost: el artículo «Trends in the wealth gap between immigrant and Canadian-born families from 2016 to 2023» devolvió HTTP 200, evaluationDecision=review y reviewable=false. No se promovió ni aprobó automáticamente.
- La inicialización de Actualidad es al cargar/usar la marca, no un backfill masivo ejecutado sobre todas las marcas.
- Los filtros se aplican a los datos cargados. El límite existente es de 2000 asociaciones recientes y hasta 30 ejecuciones por historia en Creative Studio.
- No se ejecutó una prueba automatizada de navegador ni se certificó la calidad editorial de una publicación final.

## Fuera de este cierre

Programación por línea, mezcla editorial automática, paginación ampliada, reconciliación de ejecuciones interrumpidas y validación integral de publicaciones permanecen fuera de esta entrega. El seguimiento del alcance original continúa en el feature base; LINE-08 no se marca como implementada.

### Seguimiento ELW-12 — Expedientes separados y cierre de consulta

Se corrigen falsos positivos al comparar acciones y ubicaciones: las frases y contrastes explícitos se evalúan por separado y los números cívicos de avenidas numeradas se comparan independientemente del orden. Siguen bloqueadas las direcciones trasladadas a otra acción y los números cívicos incompatibles. Un plan nuevo cuya pregunta final pide participación recibe el fact de la convocatoria cuando hay exactamente una consulta fechada con extracto; con varias no se selecciona por inferencia.

El nuevo borrador `74fb0704-ff90-4ab7-9ded-398887bf01c6` quedó guardado en versión 3, pendiente de revisión, con cierre fechado, ratio normativo y dossiers separados. Se conserva el histórico y no se regeneran ni aprueban imágenes. Las revisiones IA históricas pueden quedar obsoletas tras editar; no equivalen a una revisión de la nueva versión.

### ELW-13 — Portadas breves y curiosidad sustentada

**Estado:** Implementada · **Prioridad:** P1

- [x] Comparar tres hooks durante generación/revisión y priorizar una sola pregunta o tensión que el carrusel pueda resolver.
- [x] Orientar la portada a 4–7 palabras en idiomas separados por espacios, con advertencia por encima de nueve; conservar nombres, alcance y calificadores necesarios.
- [x] Separar hook y contexto: una línea breve debajo, sin párrafo redundante ni listado de expedientes en la portada. Advertir cuando contexto y cuerpo superen 24 palabras.
- [x] No truncar automáticamente ni convertir estas preferencias en bloqueos factuales. Una frase corta por sí sola no garantiza curiosidad ni rendimiento.
- [x] Conservar una convocatoria pública fechada explícitamente seleccionada para el cierre, aunque no se haya utilizado antes; no recuperar facts por mera coincidencia numérica.

Los prompts se versionan para nuevas generaciones. Los borradores e imágenes históricos se conservan. La evaluación del rendimiento real del hook queda para uso editorial; ningún score constituye garantía de engagement.

Validación: 489 pruebas y lint satisfactorios. Consulta autenticada posterior al guardado confirma la versión 4 de `74fb0704-ff90-4ab7-9ded-398887bf01c6`, en draft: portada «Quels loisirs pourraient ouvrir ici ?», sin cuerpo redundante, y cierre con 14 septembre, 17–19 heures y hôtel de ville. No se generaron nuevas imágenes ni se aprobó la publicación.

### ELW-14 — Acotar truncamiento y coste de solicitudes Gemini

**Estado:** Implementada · **Prioridad:** P0

- [x] Gemini 2.5/3 recibe el doble del presupuesto nominal de cada tarea: brief 8.192 y carrusel 12.288 tokens inicialmente. Techo por intento de 24.576; modelos antiguos o personalizados conservan un techo de 8.192.
- [x] `MAX_TOKENS` descarta el JSON parcial y permite un segundo intento con más salida, hasta el techo. Errores transitorios y truncamiento comparten dos intentos totales y 60 segundos por cuenta. No se multiplican con los reintentos internos del SDK, configurado a un intento.
- [x] Tras truncamiento persistente se pasa al fallback disponible sin repetir el mismo modelo/límite con otra clave. Un error de cuota sí puede utilizar la cuenta secundaria existente.
- [x] Sumar el uso conocido de intentos truncados y recuperación, incluso cuando termina en otro proveedor. Registrar modelo, intento, presupuesto, razón de parada, consumo y tamaño de entrada; nunca claves, texto del artículo o salida parcial. Cuando no hay respuesta no se puede determinar el consumo remoto.
- [x] El prompt de guion mantiene una sola copia del plan y elimina puntuaciones de elección de formato. Recibe los hechos y extractos completos del brief y metadatos de la noticia, sin repetir el artículo completo; la extracción del brief conserva el texto fuente. No se recortan hechos ni se alteran originales almacenados.
- [x] Verificar recuperación, truncamiento persistente, fallback, cuenta secundaria, uso, deadline y ausencia de datos privados en logs con proveedores simulados.

La cancelación aborta la espera y la solicitud del cliente; no garantiza detener el cómputo o cobro remoto. Aumentar el máximo permite mayor consumo si hace falta. El límite es por cuenta/llamada: la cadena completa de generación, validación y otros proveedores conserva sus límites existentes. No se promete ausencia total de fallos ni se han consumido créditos reales para estas pruebas.

Referencias: [GenerateContent y MAX_TOKENS](https://ai.google.dev/api/generate-content#FinishReason). La configuración de cancelación y reintentos se comprobó también contra los tipos del SDK `@google/genai` instalado.

Validación de ELW-14: 498 pruebas pasan; lint y build satisfactorios. No hubo cambios de esquema, credenciales ni aprobación/publicación de borradores.

### Seguimiento ELW-12 — Demolición sin ubicación y expedientes independientes

La validación ya no hereda para una demolición sin ubicación las direcciones explícitamente asignadas a otro expediente en frases o cláusulas independientes. Se conserva el bloqueo de direcciones locales incompatibles y de etiquetas de dirección sin atribución bajo un título de demolición. Un comité de demolición se distingue de una solicitud de demoler: la sede de la reunión no se trata como el inmueble afectado.

Si el extracto de la solicitud no identifica el inmueble, se muestra `PROJECT_IDENTITY_INCOMPLETE` como advertencia y no se inventa la dirección. La revisión histórica no se modifica ni se convierte en aprobada; la UI identifica un antiguo `PROJECT_LOCATION_MISMATCH` cuando los controles actuales ya no lo reproducen. La aprobación humana y el reconocimiento de la revisión anterior conservan sus reglas.

Reproducción con copia del borrador `af385e63-d904-4d3d-ba44-8f5509f8ea37`, versión 5: cero bloqueos factuales con los controles actualizados. No se cambió texto, versión ni estado del registro local.

Validación del seguimiento: 501 pruebas pasan, lint y build satisfactorios. Incluye regresión del caption y del slide 2, conservación del bloqueo para títulos de demolición sobre viviendas sin separación explícita, y distinción entre comité y acción de demolición.

### ELW-15 — Reparar bloqueos pendientes antes de entregar el guion

**Estado:** Implementada · **Prioridad:** P0

**Como** editor, **quiero** recibir las correcciones automáticas de los bloqueos detectables antes de abrir el draft, **para** concentrarme en una revisión final.

- [x] Eliminar el ciclo que quitaba un CTA genérico y después insertaba otro CTA genérico bloqueado por el mismo validador. La limpieza es idempotente; el modelo debe aportar un beneficio relacionado con el tema.
- [x] Tras generación y revisión editorial, ejecutar una última solicitud de corrección solo si quedan bloqueos. Funciona después de la rama OpenAI o de la revisión con los proveedores habituales; no añade llamadas a un borrador sin bloqueos.
- [x] Pedir parches de texto limitados a las unidades afectadas, o a la publicación cuando el problema es global. Conservar orden, roles, hechos asignados, personajes y formato; no aceptar campos extra, destinos desconocidos ni parches duplicados.
- [x] Enviar una sola copia de los hechos y sus evidencias, el texto necesario y los errores. No repetir el artículo, el plan ni las referencias privadas de marca/personajes. Presupuesto nominal de salida: 3.072 tokens, adaptado por el cliente Gemini existente. Una solicitud final, con los límites de reintento, tiempo y fallback de los proveedores existentes; sin bucle recursivo.
- [x] Repetir las validaciones factuales, narrativas y de idioma sobre el resultado completo. Aplicar el parche únicamente si reduce los bloqueos deterministas sin introducir otro tipo de bloqueo. Ante fallo o parche inútil, conservar la copia anterior y explicar el resultado.
- [x] Enviar al siguiente revisor el error estructural de la corrección rechazada, incluyendo los facts permitidos por slide. Identificar correctamente al proveedor que produjo la respuesta, en lugar de atribuir a Gemini un error de Terra.
- [x] Registrar el intento final y el consumo devuelto. No inventar puntuaciones nuevas, aprobación humana ni resolución de hallazgos independientes que el validador no pueda comprobar. El texto corregido queda para revisión humana; las puntuaciones anteriores se identifican como previas a esa corrección.
- [x] Cubrir con pruebas CTA genérico/ausente, estructura inmutable, nuevos datos no sustentados, error de proveedor, JSON inválido, conservación de hallazgos factuales y recorrido Gemini → Terra → Sol → reparación puntual.

No garantiza que cualquier afirmación pueda repararse: cuando falta evidencia o persisten hallazgos no comprobables, la pieza conserva el bloqueo explicado. La reparación automática se integra en nuevas ejecuciones de generación; guardar una edición manual no provoca llamadas adicionales a modelos. No modifica automáticamente los borradores históricos.

Caso local: se corrigió únicamente el CTA del borrador `1adb2bec-4320-4c1c-8849-4c4574d58d54` de «Labour market experiences of recent immigrants, 2019 to 2025», guardándolo como versión 3, en estado draft y con cero bloqueos deterministas. No se aprobaron ni generaron imágenes.

Validación: 508 pruebas de la suite y una prueba adicional del recorrido completo pasan; lint, TypeScript y build satisfactorios. Proveedores simulados en las pruebas; la corrección puntual del registro se guardó mediante la API local autenticada. Sin cambios de esquema ni credenciales.

### Seguimiento ELW-13 — Hook humano en dos frases

La planificación y revisión admiten una portada con situación reconocible en el título y contraste sustentado en el subtítulo. Cuando el contraste depende de dos hallazgos, el plan debe asignar ambas evidencias a la portada y desarrollarlas después; un plan existente no autoriza al generador a importar facts ajenos a su slide. Los porcentajes pueden pasar a la siguiente slide, conservando población, periodo y base de comparación. No se infieren causalidad, secuencia ni experiencias individuales compartidas entre mediciones distintas.

Caso local: «Conseguir trabajo puede ser rápido.» / «Trabajar en lo tuyo es otra historia.». El borrador de inmigración quedó como versión 5 vigente, pendiente de revisión, conservando la versión 4 aprobada. La portada cita rapidez y desajuste del campo de estudios; la segunda slide conserva el 42.5% y la comparación con el 31.3%, y la cuarta desarrolla sobrecalificación y campo de estudios como medidas distintas. No se generaron imágenes.

Validación: cero bloqueos deterministas sobre la copia preparada para guardar y confirmación de la versión mediante la API local. Prueba del recorrido de generación con proveedores simulados, lint y build satisfactorios. La preferencia editorial en el prompt no garantiza un nivel de engagement ni una selección idéntica en cada generación.
