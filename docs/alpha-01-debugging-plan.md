# Plan de depuración — Alpha 01

Generado el 2026-09-24 a partir de una auditoría completa del código antes de empezar
login y cobro por tokens. Cobertura: pipeline de generación de texto, generación de
imágenes/publicación, ingestión/deduplicación/evaluación editorial, rutas de API y
autenticación, esquema de base de datos y multi-tenencia, frontend y uso de UXDSL.

Estado mecánico del repo: `tsc --noEmit` limpio, `npm run lint` limpio, 924 tests
pasando, cero `TODO`/`FIXME` sueltos, cero `@ts-ignore`. Todo lo que sigue es un
hallazgo de lógica/comportamiento real, verificado con archivo:línea, no una alerta
genérica.

Cada hallazgo tiene una casilla para marcarlo al corregirlo. La severidad indica
riesgo real (pérdida de datos, cobro duplicado, fuga entre clientes), no solo estilo.

---

## Ya resuelto en esta sesión

- [x] Bug real de aprobación de historias: el borrador de la historia de CRA nunca se
  creó porque `repairCarouselPlanQuestions` no reconocía preguntas en español con
  preposición al frente ("¿A quiénes...?"), así que una pregunta doble no se reparaba
  y tumbaba toda la generación del brief sin aviso. Corregido y probado en
  `carousel-narrative.ts`, verificado en vivo contra la historia real.
- [x] `carouselPlan` reutilizaba evidencia en slides consecutivos (bug de generación
  en vivo, corregido con una rama nueva en `repairCarouselPlanEvidence`).
- [x] `visualNeed: "real-photo"` del writer era código muerto — nunca se enrutaba a
  ningún lado. Conectado al mismo pipeline de geografía verificada que `verified-map`.
- [x] `isPlaceCompositionBatch` no reconocía dígitos en el sufijo de versión
  (`+map-ai-v2`), rompiendo el reconocimiento de lotes.
- [x] No existía ninguna estructura de enumeración ("N cosas que…"): los cuatro
  enfoques eran lentes narrativos y el brief convertía un listicle en historia
  de consecuencia. Añadida la estructura `hook-list`, overrides por brief de
  estructura/enfoque/objetivo de conversión, y corregido que el pipeline
  single-shot ignoraba `storyStructure` por completo (ver
  `docs/features/recipe-carousel.md`).
- [x] Una portada de carrusel podía salir como la tarjeta local de solo texto:
  el guionista la marcaba `assetRequest: "typography-only"` y nada lo impedía.
  Ahora la guía lo prohíbe, el parser lo corrige, y la composición de imágenes
  manda siempre la portada al modelo (salvo políticas estrictas de foto), con
  bump de versión de composición para que un draft ya guardado reciba un lote
  nuevo.

---

## Hallazgos críticos

Bloquean que la beta sea confiable. Varios implican pérdida de trabajo aprobado o
cobro duplicado a proveedores — deberían ir primero, antes que cualquier limpieza.

- [ ] **Regenerar un borrador destruye el contenido ya aprobado, sin historial ni
  forma de recuperarlo, y la interfaz no lo bloquea.** `replaceCreativeDraft`
  (`creative-content.repository.ts:489`) siempre pone `status: "draft"` salvo que se
  pase `approve: true` explícito; ningún llamador de regeneración lo pasa. El botón
  "Generar nuevo borrador AI" en `creative-draft-workspace.tsx:1913-1925` no verifica
  si el borrador activo está aprobado, a diferencia de otros flujos del mismo archivo
  que sí lo hacen. En el pipeline single-shot (activo hoy) es peor: el primer
  checkpoint sobrescribe el borrador aprobado *antes* de que el contenido nuevo pase
  por la auditoría de OpenAI. Confirmado de forma independiente por dos auditorías
  distintas (texto e imágenes). Sin tabla de historial de contenido, lo destruido es
  irrecuperable.
- [ ] **Un trabajo pagado en fal.ai puede quedar huérfano y cobrarse dos veces.**
  `submitStoredAsset` (`manage-creative-assets.ts:949-964`) guarda el `requestId` en
  el mismo try/catch que envía el trabajo a fal; si la respuesta se pierde antes de
  persistir el `requestId`, ese trabajo pagado queda sin forma de sondearse
  (`pollFalImage` solo funciona por `requestId`), se marca `"failed"`, y cualquier
  reintento genera y cobra un trabajo nuevo.
- [ ] **Un solo error de fal.ai en un lote mata y etiqueta mal a las demás imágenes
  del mismo lote que seguían generándose (y ya pagadas).** `syncCreativeAssetBatch`
  (`manage-creative-assets.ts:890-898`) relanza cualquier error no manejado de una
  imagen, abortando todo el `mapWithConcurrency`; el catch de
  `syncPendingCreativeAssetBatches` (`:990-996`) marca `"failed"` a *todas* las demás
  imágenes en curso del lote, con el mensaje de error de la que sí falló. Escenario:
  1 de 6 slides de un carrusel tiene un prompt inválido (error real); las otras 5,
  que seguían generándose normalmente, se destruyen con un mensaje que no les
  corresponde.
- [ ] **Una regla de "foto reutilizable" no reconoce la palabra española
  "renovación"**, solo "construcción/reparación/remodelación" (`creative-documentary.ts:117-119`
  y el regex equivalente en `prepare-place-visuals.ts:58`). Una fuente que diga
  "Continúan las obras de renovación en la Plaza…" no dispara la alerta de lugar
  cambiado, así que una foto de archivo ya aprobada se reutiliza como si el lugar no
  hubiera cambiado — justo el tipo de foto engañosa que AGENTS.md §12 prohíbe.
- [ ] **No hay ninguna frontera de tenant a nivel de base de datos para ~30 tablas.**
  Solo `rss_sources`/`topic_sources` y `knowledge_documents` tienen una restricción
  real (`FOREIGN KEY` compuesta) que ata cada fila a su `workspace_id`. Todo lo demás
  (evaluación editorial, briefs, borradores, assets, publicaciones) depende
  enteramente de que el código de la aplicación filtre siempre por el `topic_id`
  correcto. Hoy es invisible porque solo existe un workspace ("default"). El día que
  haya un segundo cliente real, una sola consulta sin ese filtro es una fuga de datos
  entre clientes.
- [ ] **`stories.canonical_url` es único a nivel global, sin separación por tenant**,
  y se deriva directo de la URL de la fuente (`story-radar.repository.ts:118`). Dos
  clientes que sigan las mismas fuentes públicas (p. ej. dos líneas editoriales de
  "noticias locales" leyendo el mismo feed gubernamental) van a compartir la misma
  fila de `stories`, y su título/contenido se sobrescribe según quién la tocó al
  último — sin importar el cliente. Requiere una decisión de producto explícita antes
  de dar de alta un segundo tenant real.

---

## Hallazgos altos

- [ ] `daily-preparation.ts` descarta el error real en cada uno de sus 10 pasos
  automáticos (`:177-182`): nunca hay un solo `console.*` en todo el archivo, y el
  usuario solo ve un texto genérico fijo. Es la misma clase de bug detrás del caso de
  CRA, pero sistémica en todo el motor de preparación diaria, no un caso aislado.
- [ ] Aprobar/quitar varias historias en lote puede **confirmarse parcialmente en la
  base de datos mientras el usuario ve un error total** (`story-editorial.repository.ts:761-905`),
  y el dashboard no refresca el estado tras ese error (`radar-dashboard.tsx:1111-1134`)
  — a diferencia de otros flujos del mismo archivo que sí refrescan. Reintentar el
  mismo lote falla para siempre porque esas historias ya no son elegibles.
- [ ] `stories.review_decision` y `stories.processing_status` están confirmados como
  código/columnas muertas — nada fuera de `schema/stories.ts` los lee, y
  `review_decision` nunca se escribe en ningún lado. El estado real vive solo en
  `topic_stories`. Documentar esto explícitamente (o migrarlos fuera) para que nadie
  — yo incluido, en una sesión futura sin este contexto — vuelva a "arreglar" la
  columna equivocada.
- [ ] Existe una ruta de fusión de historias por similitud de título
  (`story-radar.repository.ts:444-558`, actualmente sin llamadores en producción pero
  alcanzable) que podría sobrescribir el título/URL de una historia ya
  aprobada/publicada con los de una historia distinta — contradice directamente la
  regla de AGENTS.md §5 de nunca sobrescribir así. No hay ninguna protección de tipos
  que impida que un futuro caller la reactive.
- [ ] Cuando el proveedor principal de evaluación falla, el sistema cae a **OpenAI**
  para calcular Editorial/Growth Score (`gemini-story-editorial-evaluator.ts:98-169`)
  — pero AGENTS.md §23 dice explícitamente que OpenAI nunca debe generar esos
  puntajes. Groq, que sí debería estar en esa cadena de respaldo, no aparece.
- [ ] `creative_text_calls` puede quedar con reservas atoradas en `status='reserved'`
  para siempre si el proceso muere a medio camino (timeout de función en Vercel) —
  nada en el código reclama filas en ese estado (solo las `'uncertain'` se barren tras
  15 minutos). Fuga silenciosa de presupuesto, directamente relevante para el cobro
  por tokens.
- [ ] `carousel-narrative.ts` (validación de plan de carrusel) y `creative-quality.ts`
  (detección de CTA genérico/conflicto con meta de conversión) **no tienen cobertura
  en francés**, solo inglés/español — son hermanos directos del bug de "a quiénes" ya
  corregido. Relevante porque el producto sí soporta líneas editoriales en francés
  (Quebec).
- [ ] `creative-fact-guard.ts` tiene plantillas de respaldo con textos fijos solo en
  inglés/español (`:1179-1188`, `:1243-1249`, `:2145-2169`, `:2197-2215`) mientras
  otras funciones del mismo archivo sí manejan francés correctamente — para una línea
  editorial en francés esto filtra inglés al texto reparado o dispara un error de
  "idioma mezclado" confuso cuya causa real es invisible para el editor.
- [ ] El pipeline single-shot puede sobrescribir un borrador aprobado **hasta 10 veces
  en una sola regeneración** (cada `checkpoint()` en `creative-single-shot-editorial.ts`
  hace un `replaceCreativeDraft`), mientras el pipeline legado hace solo una
  transición limpia al final — agrava el hallazgo crítico de pérdida de contenido
  aprobado.
- [ ] `deduplicateIssues` en `creative-fact-guard.ts:2611-2620` descarta hallazgos de
  seguridad factual distintos si comparten código+slide, aunque el mensaje sea
  diferente — un hallazgo real de seguridad factual puede perderse silenciosamente
  antes de llegar a un editor (AGENTS.md §12).
- [ ] Si el presupuesto de texto de una historia se agota justo durante el paso de
  reparación del single-shot, el borrador reparado (sin auditoría) se guarda como el
  "actual" de todos modos, descartando la auditoría previa, aunque la ejecución
  completa se marque como fallida.
- [ ] **No existe ninguna clave de idempotencia en las llamadas a los proveedores de
  IA.** Si el proceso muere justo durante una llamada de reparación/verificación
  (`creative-editorial-loop.ts:100-105`, `:159-172`), al reanudar se puede volver a
  pagar y reintentar una llamada que el proveedor ya había procesado — sin forma de
  distinguir "nunca se intentó" de "se intentó y no sabemos el resultado".
- [ ] `daily-preparation/resume` usa el mismo secreto compartido del navegador
  (`RADAR_COLLECTOR_SECRET`) en vez de una credencial de worker dedicada como su
  hermano `internal/instagram-publications/resume`, y no tiene ningún alcance por
  topic — dispara trabajo de IA en toda la plataforma con la identidad más débil de
  toda la app.
- [ ] La generación de imágenes con fal.ai **no tiene ningún tope diario/presupuesto**,
  a diferencia de texto y evaluación editorial, que sí lo tienen. Bajo el modelo
  actual de un solo secreto esto ya es gasto sin control; bajo cobro por usuario es
  riesgo directo de abuso/facturación.
- [ ] Ningún borrador aprobado se "congela" a R2 automáticamente — solo hay un botón
  manual. fal borra las imágenes a los 30 días, así que un borrador aprobado y nunca
  programado puede volverse **permanentemente irrecuperable** sin ninguna alerta.
- [ ] `creative_text_calls` (la única tabla de contabilidad de costos que existe) solo
  mide llamadas de texto — **no cubre generación de imágenes**, que es casi seguro el
  gasto dominante. No sirve todavía como base de cobro tal cual.
- [ ] `daily_preparation_runs` no tiene índice para su consulta de reclamo de worker
  (`WHERE status='running' AND lease_until < now()`), a diferencia de su tabla hermana
  `instagram_publication_jobs`, que sí lo tiene bien hecho.

---

## Hallazgos medios

- [ ] La provenance entre fuentes se descarta al fusionar duplicados dentro de una
  misma corrida de recolección (`deduplicate-story-candidates.ts`,
  `deduplicate-similar-stories.ts`) — si dos feeds RSS traen el mismo artículo en la
  misma corrida, solo la atribución de uno sobrevive. Contradice AGENTS.md §5.
- [ ] El Growth Score puede guardarse como `0` "real" cuando en verdad no se pudo
  calcular (`gemini-story-editorial-evaluator.ts:720-744`), la misma ambigüedad ya
  conocida de `relevance_score` pero en una columna que además es obligatoria en el
  tipo, forzando al parser a inventar el cero.
- [ ] Condición de carrera en enriquecimiento de contenido
  (`story-content.repository.ts:222-326`): no hay token de intento ni versión, así
  que una preparación manual y una automática corriendo en paralelo sobre la misma
  historia pueden pisarse — incluyendo que un `"failed"` tardío sobrescriba un
  `"completed"` más nuevo.
- [ ] Columnas con nombre específico de dominio (`canadaRelevance`, `aiRelevance`,
  `NOT NULL` para toda historia de cualquier topic) en el evaluador genérico —
  contradice el mandato de AGENTS.md de mantener el núcleo agnóstico de dominio.
- [ ] Contadores de tokens (`prompt_tokens`, etc.) con `DEFAULT 0 NOT NULL` en varias
  tablas — misma ambigüedad "0 real" vs "no calculado" que `relevance_score`, más
  suave porque algunas tablas sí tienen columna de estado para desambiguar.
- [ ] `radar_preferences` no tiene `topic_id` ni `workspace_id` — es una sola fila
  global. Confirmar si es intencional (perilla de radar a nivel plataforma) antes de
  multi-tenencia; si no lo es, un cliente le está imponiendo sus preferencias a todos.
- [ ] `daily_preparation_runs.line_id` no tiene `FOREIGN KEY`, a diferencia de tablas
  hermanas que sí protegen `(topic_id, line_id)` — se puede insertar un id de línea
  editorial inexistente o de otro topic sin que la base de datos lo impida.
- [ ] Solo dos subsistemas de ingestión (RSS, documentos) tienen la protección de
  `workspace_id` compuesta — el resto del dominio (editorial/creativo/publicación) no
  la tiene. Vale la pena dejarlo explícito para que no se asuma que el patrón ya está
  aplicado en todos lados.
- [ ] Coincidencia de substring sin límite de palabra en la reutilización de fotos
  (`reuse-documentary-visuals.ts:19-21`) — un nombre de lugar aprobado que sea prefijo
  de otro nombre distinto puede adjuntar la foto equivocada.
- [ ] `unapproveCreativeDraft` no tiene protección de concurrencia optimista, a
  diferencia de `approveCreativeDraft` que sí la tiene — un clic de "desaprobar"
  obsoleto puede revertir silenciosamente una versión más nueva ya reaprobada.
- [ ] El token de acceso de Instagram (de larga duración) se envía como parámetro de
  URL en 4 lecturas de Graph API, inconsistente con el patrón de solo-header que el
  mismo archivo usa (con un comentario explicando por qué) en las llamadas de
  publicación.
- [ ] Las solicitudes duplicadas de "generar imágenes" están protegidas a nivel de
  base de datos (no hay doble cobro), pero la solicitud perdedora recibe un error 500
  genérico en vez de un "ya se está generando" claro.
- [ ] El regex de `closureKind` para "complètement fermée" no está anclado a su sujeto
  — un cierre de rampa puede clasificarse como cierre de vía principal, el mismo tipo
  de confusión que ya se probó explícitamente para otros casos.
- [ ] Un error inicial de auditoría en el single-shot marca toda la corrida como
  fallida aunque ya exista un borrador válido y reanudable guardado — el editor ve
  "falló la generación" para una historia que en realidad tiene un borrador usable
  esperando.
- [ ] Un brief exitoso y ya cobrado se descarta si el reintento del draft también
  falla validación en el single-shot — no hay checkpoint intermedio entre generar el
  brief y generar el draft.
- [ ] Mensajes de error que dicen "Gemini" sin importar el proveedor real responsable
  (aparecen también cuando el que respondió fue OpenAI/Groq/Cloudflare) — confunde el
  diagnóstico de incidentes en producción, más probable ahora que el single-shot usa
  OpenAI en varias etapas.
- [ ] Código muerto que documenta una intención no implementada:
  `assertNoDeterministicCreativeBlockers`/`CreativeQualityGateError` (0 usos, parece
  ser un candado de seguridad de publicación que nunca se conectó) y
  `repairCandidatesForSeverity`/`verificationCriticCandidates` (el diseño documentado
  de "Terra revisa a Sol, Sol revisa a Terra" no es lo que el código realmente hace).
- [ ] `scopeMatches` (comparación de mes/año en verificación factual) solo reconoce
  nombres de mes en inglés/español — un mes en francés nunca hace match, causando un
  rechazo falso de "alcance faltante" en historias francesas correctas.
- [ ] `hasReaderStakeLanguage` es `false` garantizado para francés — rechaza cierres
  de carrusel en francés que en realidad sí resuelven la apuesta del lector.
- [ ] Comparación no resistente a temporización (`!==` simple) en el secreto de mayor
  valor de toda la app (`radar-api-auth.ts:21`), mientras el secreto de worker sí usa
  comparación segura.
- [ ] Sin límite de intentos ni bloqueo tras fallos repetidos de autenticación en
  ninguna parte de la app.
- [ ] El header `X-Radar-Confirm: DELETE` de `/radar/admin` es solo una guarda de UX,
  no un control de seguridad real — cualquiera con el secreto compartido puede
  agregarlo trivialmente.

---

## Hallazgos bajos / limpieza

- [ ] Código muerto confirmado (cero llamadores en todo el repo, incluidos tests):
  `CreativeImageEditInput`/`CreativeAssetGenerationResponse`, `findCreativeDrafts`,
  `listCreativeImageModels`, `CreativeImageGenerationMode`,
  `FAL_TEXT_TO_IMAGE_ENDPOINT`/`FAL_REFERENCE_GUIDED_ENDPOINT` (duplicados a mano en
  otro archivo), `INSTAGRAM_PUBLISHING_SCOPE`, `getDefaultViewerQuestion`,
  `fallbackCriticIssues` (siempre `undefined`, la historia de git muestra que antes sí
  hacía algo y quedó huérfano en un refactor).
- [ ] `groundedClosingQuestion` es una copia sin migrar del patrón de localización que
  el resto del archivo ya usa correctamente.
- [ ] `coverHasLikelyFiniteVerb` siempre devuelve `true` para cualquier idioma que no
  sea inglés/español — la alerta de "falta verbo en la portada" nunca dispara en
  francés (severidad de aviso, no bloqueo).
- [ ] `inferredFactQualifiers` es un regex complementario solo en inglés — bajo
  impacto porque es aditivo, no la única salvaguarda.
- [ ] La ruta `sources/rss/[sourceId]` vive fuera del namespace `/api/radar`, sin
  razón funcional aparente.
- [ ] Comentario desactualizado en `getDecryptedTopicMetaAccessToken` que dice "no se
  usa en ninguna ruta todavía" cuando sí se usa hoy en el flujo de publicación.
- [ ] Migración `0065` ausente en el historial (no rompe nada, `db:check` pasa, pero
  puede confundir a alguien que asuma que un hueco significa corrupción).
- [ ] Varias columnas de llave foránea sin índice dedicado (bajo tráfico probable,
  igual vale una pasada).
- [ ] El endpoint legado `gpt-image-2/edit` perdería silenciosamente el campo
  `input_fidelity` si alguna vez se volviera a invocar — hoy inalcanzable porque otro
  chequeo lo bloquea antes.
- [ ] Varios componentes "use client" importan valores en tiempo de ejecución (no solo
  tipos) de módulos sin guarda `server-only` — nada secreto es alcanzable hoy, pero no
  hay ninguna protección de build que impida que una futura adición a esos módulos
  filtre algo al navegador sin querer.

---

## Hallazgos de frontend y UXDSL

Auditoría de los 20 componentes `"use client"`. `tsc`/`lint` limpios; cero secretos,
llaves de proveedor o ids internos encontrados en el DOM o en `console.*`.

### Fallas silenciosas / flujos rotos

- [ ] En `meta-connection-panel.tsx:468`, la `key` de `InstagramPublishingAccessPanel`
  incluye `status`/`busy`, que cambian con casi cualquier acción del panel hermano. Si
  un usuario dispara "Verificar acceso de publicación" y luego hace clic en Conectar/
  Desconectar/Sincronizar, React remonta el componente hijo a medio camino, se aborta
  la verificación en curso, y el aborto **no muestra error** — el botón simplemente
  vuelve a su estado inicial como si nada hubiera pasado.
- [ ] En `creative-brand-image-editor.tsx`, la señal de "otra operación está ocupada"
  (`disabled`) solo la respeta el botón de descarga — el botón "Aplicar" (una
  regeneración de imagen que cuesta dinero) puede dispararse mientras otra operación
  cara ya está corriendo en el mismo workspace.
- [ ] `CharacterReferencePreview` en `creative-profile-fields.tsx:1942-1985` se queda
  atorado en "Loading" para siempre si la carga falla — no tiene la misma bandera
  `unavailable` que su componente hermano `BrandReferencePreview` sí tiene. Es una
  regresión real, no una decisión de diseño.
- [ ] `topic-configuration-panel.tsx:254-339` comparte un solo estado de error entre
  cuatro `useEffect` independientes (fuentes/contenido propio/investigación IA/
  documentos); si investigación IA falla y luego fuentes carga bien, el error visible
  se borra mientras la sección de investigación IA se queda en "Cargando…" para
  siempre, sin ninguna señal de que algo falló.
- [ ] El sondeo de estado de publicación en `instagram-publication-candidate-panel.tsx:168-185`
  no tiene límite de reintentos ni backoff — si el endpoint falla de forma persistente,
  sondea cada 2.5s para siempre con la interfaz congelada en "Publicando…" sin mostrar
  nunca un error.
- [ ] `creative-draft-workspace.tsx` tiene **seis mensajes de estado en español**
  ("Cambio guardado. Aplícalo cuando quieras.", etc.) dentro de una app que en todo lo
  demás está en inglés — se vería como un bug real para cualquier editor.
- [ ] `radar-dashboard.tsx:2995` (`ScoreCell` con `localScore`) renderiza `0` para una
  historia sin calificar todavía, porque la columna es `NOT NULL DEFAULT 0` y el
  componente no distingue "no calculado" de "calificó cero" — el mismo problema que ya
  documentamos a nivel de base de datos, pero visible directamente en la tabla y
  afectando también el filtro "ocultar por debajo del piso" y el ordenamiento.
- [ ] Inconsistencia de `secret.trim()` en `editorial-profile-panel.tsx` y
  `creative-documentary-panel.tsx`: un secreto pegado con un espacio de más funciona
  en el resto de la app pero da un 401 genérico específicamente en estos dos paneles.
- [ ] `instagram-gallery-panel.tsx:750-781` pone `[]` cuando falla la carga de
  borradores/lotes — indistinguible de "esta historia de verdad no tiene borradores".
  Un error 500 se ve como una lista vacía, sin aviso ni reintento.
- [ ] Subida secuencial de referencias de personaje (`creative-profile-fields.tsx:1711-1749`):
  si una imagen de en medio falla, las anteriores ya se guardaron en el servidor pero
  la interfaz no lo refleja hasta recargar todo — y reintentar arriesga duplicados.
- [ ] El sondeo de assets de imagen en `creative-draft-workspace.tsx:472-507` tampoco
  tiene límite de reintentos — reintenta cada 2.5s para siempre ante un fallo
  persistente.
- [ ] **El secreto único de administrador vive en texto plano en `sessionStorage`**
  (`radar-dashboard.tsx:400-428`), usado como Bearer token en cada solicitud de cada
  panel. Cualquier script que corra en el mismo origen (un XSS) puede leer el único
  secreto que autoriza toda la app, y no hay identidad por usuario, expiración ni
  rotación sobre la cual construir. Vale la pena señalarlo explícitamente ahora que
  login/cobro es el siguiente paso: este patrón hay que reemplazarlo, no extenderlo.
- [ ] `handleRecoverDraft` en `creative-draft-workspace.tsx:644` usa `finally` para
  recargar el workspace incondicionalmente; si la recuperación falla y esa recarga
  también falla, el error genérico de la recarga reemplaza al error real de la
  recuperación (semántica de `finally` en JS).
- [ ] Tres refrescos de estadísticas en segundo plano usan `.catch(() => {})` sin
  ninguna señal si fallan — la tarjeta de estadísticas del dashboard puede quedar
  desactualizada sin que nadie se entere (impacto bajo, la acción principal ya mostró
  su propio éxito).

### Consistencia de UXDSL

- [ ] **El compilador de UXDSL descarta en silencio los argumentos de color y estilo
  de `border(n, color, style)` en 46 declaraciones**, en los cuatro archivos `.uxdsl`
  del proyecto (`creative-draft-workspace.module.uxdsl`: 31 casos,
  `radar-dashboard.module.uxdsl`: 7, `topic-configuration-panel.module.uxdsl`: 7,
  `editorial-profile-panel.module.uxdsl`: 1). Es un bug confirmado en el propio
  compilador (`node_modules/postcss-uxdsl/dist/index.js:751-757`): solo lee la primera
  parte antes de la primera coma y descarta el resto. El resultado compilado es
  siempre el mismo gris fijo, nunca el color de marca del Topic — aunque el resto del
  sistema de theming por Topic sí funciona bien. La build no muestra ninguna
  advertencia. Dado que este repo es justo el que se usa como referencia pública de
  UXDSL, esto vale la pena: (a) corregirlo aquí escribiendo `border: 1px solid
  palette(...)` literal como recomienda la propia guía, y (b) reportarlo al proyecto
  `postcss-uxdsl`, porque su propio comentario inline promete un soporte que nunca
  implementó.
- [ ] Opacidad fija (`opacity: 0.68`) escrita a mano en dos `<span>` de
  `creative-profile-fields.tsx:280-281`, dentro de un bloque donde todo lo demás sí
  se deriva correctamente de la paleta de marca — inconsistencia aislada, no
  sistémica.

Fuera de estos dos puntos, el uso de UXDSL es disciplinado: no se encontraron colores
hexadecimales ni espaciados en píxeles escritos a mano fuera de lo ya listado, y cada
panel reutiliza correctamente uno de los cuatro CSS Modules compilados.

---

## Contexto fundacional: login y cobro por tokens

Esto no son "bugs" — es el estado real del terreno sobre el que se va a construir.

**Autenticación hoy:** no existe ningún sistema de usuarios, sesiones ni librería de
auth instalada (se revisó `package.json`: nada de next-auth/clerk/lucia/etc.), y no
hay `middleware.ts`. Todo el panel funciona con un único secreto compartido
(`RADAR_COLLECTOR_SECRET`) que se escribe a mano en el navegador y se guarda en
`sessionStorage` (`radar-dashboard.tsx:400-423`), enviado correctamente como header
`Authorization: Bearer`. Cualquiera con ese secreto tiene acceso total a las 66 rutas
protegidas de la app — no hay ningún control de "¿este llamador puede tocar este
topic?", solo se verifica que el topic exista.

**Tenencia (workspaces):** ya existe una tabla `workspaces` pensada explícitamente
como frontera de tenencia, con `topics.workspace_id` indexado y con constraints. Pero
`DEFAULT_WORKSPACE_ID = "default"` solo se usa en un archivo — casi nada del resto de
la app está realmente separado por workspace todavía. Es una base a medio construir,
no una capa activa. Ver los dos hallazgos críticos de base de datos arriba.

**Ranking de "qué asegurar primero" cuando entre login real** (de mayor a menor
impacto si sale mal):
1. Publicar en Instagram de verdad (`publication-job`) y congelar/descartar el
   paquete de publicación (`publication-package`) — un error aquí significa publicar
   en la cuenta de otro cliente.
2. Cualquier ruta que gaste dinero en un proveedor de IA (generación de imágenes,
   evaluación, investigación con IA, ingestión de PDFs) — varias sin tope de
   presupuesto todavía.
3. `/radar/admin` DELETE — borra irreversiblemente los datos de radar de un topic.
4. `daily-preparation/resume` — sin alcance por topic, dispara gasto de IA en toda la
   plataforma, con la identidad más débil de la app.
5. Conexión OAuth de Instagram (tokens, credenciales de la app).
6. Alta/baja de topics y sus fuentes.
7. El resto (borradores, personajes, referencias de marca, fotos, reseñas,
   preferencias) — impacto contenido, recuperable.

**Preparación para cobro:** `creative_text_calls` ya tiene un patrón real de
reserva→liquidación con snapshot de precio inmutable — un buen punto de partida. Pero
solo cubre texto, no imágenes (el gasto probablemente dominante), no tiene vínculo con
workspace/cuenta, no documenta moneda, y no existe ningún concepto de periodo de
facturación, plan o cuota en todo el esquema. Es un componente para extender, no una
base de cobro lista.

---

## Plan de ataque sugerido

**Fase 1 — Frenar pérdida de datos y de dinero (los críticos).**
Pérdida de contenido aprobado al regenerar, doble cobro de fal.ai por job huérfano,
cascada de fallos en lotes de imágenes, fotos obsoletas por "renovación" sin detectar.
Estos son los que más duelen si siguen ocurriendo mientras se construye encima.

**Fase 2 — Visibilidad de errores silenciosos.**
`daily-preparation.ts` sin logs, aprobación/rechazo en lote con confirmación parcial
invisible, la clase de bug detrás del caso de CRA. Esto es lo que más tiempo de
soporte va a costar si no se arregla antes de tener usuarios reales.

**Fase 3 — Higiene de datos.**
Documentar o eliminar `stories.review_decision`/`processing_status`, cerrar la ruta de
fusión de historias que podría sobrescribir una ya publicada, corregir el 0-vs-null
del Growth Score, restaurar provenance de fuentes duplicadas en la misma corrida.

**Fase 4 — Terreno para login y cobro.**
Decidir la estrategia de `stories.canonical_url` entre tenants, extender la
protección `workspace_id` compuesta más allá de RSS/documentos, agregar un ledger de
costo de imágenes, agregar índice de `created_at` para consultas de periodo de
facturación, reclamar reservas `'reserved'` atoradas.

**Fase 5 — Cobertura de francés.**
Mismo patrón que el bug de "a quiénes" ya corregido, repetido en varios validadores
de carrusel, CTA y verificación factual — hacerlo de una sola pasada ya que el patrón
es el mismo en todos los archivos.

**Fase 6 — Limpieza de código muerto y consistencia menor.**
Todo lo listado en "Hallazgos bajos".

**Fase 7 — Frontend: errores silenciosos y UXDSL.**
Los sondeos sin límite de reintentos, el estado de error compartido entre efectos
independientes, y el bug de `border()` en el compilador de UXDSL (este último con
prioridad extra por ser el repo de referencia pública de UXDSL). El secreto único en
`sessionStorage` se resuelve solo junto con el login real, no antes — no tiene caso
parchearlo por separado.
