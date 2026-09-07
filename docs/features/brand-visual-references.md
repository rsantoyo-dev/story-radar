# Feature: Referencias visuales de marca para image-to-image

**ID:** FEAT-BRAND-001  
**Estado:** Propuesta — implementación pendiente  
**Marca piloto:** salut.st.jean  
**Tablero:** [brand-visual-references.kanban.md](brand-visual-references.kanban.md)

## Problema y resultado esperado

Las referencias de protagonistas ayudan a conservar su identidad, pero la marca también tiene un lenguaje visual: posters, stickers, formas, colores y señalética. El editor necesita aportar ejemplos que el generador pueda ver y utilizar como orientación, además del prompt y las imágenes del protagonista.

Esta biblioteca proporciona **imágenes de referencia al recorrido image-to-image**. No coloca elementos encima del resultado, no construye un collage determinista y no requiere recortar los objetos de una lámina. La IA produce la imagen final a partir de las entradas visuales y las instrucciones. El draft conserva esas decisiones para futuras modificaciones.

## Ejemplos del piloto

| Material aportado | Uso esperado |
|---|---|
| Post terminado de referencia | Orientar composición, densidad, colores y lenguaje gráfico, sin copiar la noticia anterior. |
| PNG con 30 stickers o motivos | Aportar un repertorio visual en una sola imagen; el generador puede inspirarse en algunos elementos. |
| Posters y calcomanías de “j’aime St-Jean” | Orientar motivos y ambiente local según las instrucciones guardadas. |
| Ejemplos de nomenclatura de calles | Orientar formas y tratamiento visual; no inventar una dirección ni acreditar un lugar real. |

Estos ejemplos no afirman que exista una guía municipal validada ni que la marca tenga afiliación oficial. La generación puede reinterpretar formas, letras y motivos: esta feature no garantiza copia exacta de un logo, slogan o sticker. El tratamiento existente del logo se conserva como una responsabilidad separada.

## Flujo propuesto

1. En la configuración de marca se suben referencias, sus condiciones de uso y qué debe tomar la IA de ellas. Las descripciones automáticas son ayuda opcional.
2. Al preparar un draft, el sistema selecciona referencias pertinentes por unidad, combinándolas con las del protagonista dentro de los límites del proveedor.
3. El servidor envía las imágenes al endpoint image-to-image con instrucciones que distinguen identidad del protagonista y estilo de marca.
4. Guarda en el draft y en el asset las referencias versionadas e instrucciones usadas. El editor revisa el resultado al final, sin pasos humanos adicionales durante la preparación.
5. Las ediciones de una imagen pueden reutilizar ese contexto o cambiarlo explícitamente, creando otra versión sin regenerar todo el carrusel.

## Alcance y entregas

MVP: biblioteca privada por tema, instrucciones reutilizables, selección automática acotada, integración image-to-image, snapshots y revisión final. La conexión con edición individual usa el alcance de [edición de imágenes](creative-image-editing.md); la biblioteca y generación inicial pueden entregarse antes de esa integración.

No incluye entrenamiento de un modelo, extracción obligatoria de objetos, editor de capas, composición posterior de decoraciones ni reproducción exacta de texto mediante generación. No habilita generación en el recorrido de [fidelidad documental](real-place-visual-fidelity.md) ni publica automáticamente mediante [Instagram](instagram-publishing.md).

## Historias

### BRAND-01 — Subir referencias visuales de marca

**Historia:** [BRAND-01](../stories/BRAND-01.md)

**Como** editor, **quiero** subir referencias visuales de marca, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** ninguna

**Criterios de aceptación**

- La biblioteca por tema permite subir PNG, JPEG y WebP: posts terminados, posters, stickers, señalética y láminas con múltiples elementos. Conserva el original; no exige separar una lámina en objetos.
- Cada referencia registra ID estable, versión, hash, dimensiones, tipo, nombre, procedencia y condiciones declaradas para reutilización y envío al proveedor. Subirla no la convierte en un logo ni en un personaje.
- El servidor valida contenido, límites de bytes y dimensiones antes de guardar mediante las abstracciones privadas de R2. Lecturas y vistas previas requieren autenticación y aislamiento por tema; no exponen claves de almacenamiento.
- La UI usa UXDSL, paleta y breakpoints del proyecto; permite ver, nombrar y desactivar referencias sin borrar originales usados en versiones históricas.

### BRAND-02 — Definir qué aporta cada referencia

**Historia:** [BRAND-02](../stories/BRAND-02.md)

**Como** editor, **quiero** definir qué aporta cada referencia, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-01

**Criterios de aceptación**

- El editor puede indicar aportes como colores, composición, textura, formas, motivos o ambiente, y qué evitar copiar. Estos ajustes se guardan en la biblioteca como configuración reutilizable.
- Una referencia de post terminado orienta el lenguaje visual; sus titulares, fechas, personas y afirmaciones no se trasladan automáticamente a otra noticia.
- El análisis visual opcional propone descripciones estructuradas con evidencia y campos desconocidos. No inventa nombres de fuentes tipográficas, identidad de lugares ni reglas oficiales de marca.
- Los datos de imágenes, OCR y descripciones se tratan como contenido no confiable. No pueden cambiar instrucciones del sistema, permisos ni políticas. La configuración explícita del editor prevalece sobre las sugerencias.
- Activar una referencia exige condiciones compatibles con su uso y transmisión; el análisis automático no acredita esos permisos. La configuración se realiza antes del recorrido por publicación.

### BRAND-03 — Seleccionar referencias automáticamente por unidad

**Historia:** [BRAND-03](../stories/BRAND-03.md)

**Como** editor, **quiero** seleccionar referencias automáticamente por unidad, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-02

**Criterios de aceptación**

- La preparación selecciona referencias activas del mismo tema según noticia, perfil y propósito de cada unidad. Registra IDs, versiones, función y motivo de selección; no requiere selección humana intermedia.
- El selector usa únicamente IDs realmente disponibles. Límites configurables de cantidad, bytes y coste respetan la capacidad del proveedor y contemplan conjuntamente referencias de protagonista y de marca.
- El reparto prioriza las referencias necesarias del protagonista y después las de marca pertinentes; un exceso se resuelve de forma determinista y queda explicado. No se envía toda la biblioteca indiscriminadamente.
- Sin referencias elegibles se conserva el comportamiento permitido por la política vigente y se explica la ausencia. No se cambia silenciosamente una política documental para poder generar.
- La biblioteca vacía conserva el comportamiento existente de los drafts. Cada slide puede seleccionar referencias distintas manteniendo el contexto visual común.

### BRAND-04 — Enviar referencias al recorrido image-to-image

**Historia:** [BRAND-04](../stories/BRAND-04.md)

**Como** editor, **quiero** enviar referencias al recorrido image-to-image, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-03

**Criterios de aceptación**

- Las imágenes seleccionadas se transmiten desde el servidor al endpoint explícito image-to-image, junto con el prompt y las referencias de protagonista aplicables. No basta con incluir sus nombres o URLs como texto del prompt.
- El adaptador conserva un mapeo entre cada entrada visual y su función: identidad del protagonista o lenguaje visual de marca. El prompt explica qué tomar de cada referencia sin prometer reproducción exacta.
- Una lámina de 30 elementos se envía como referencia visual completa dentro de los límites del proveedor; no requiere segmentación, extracción individual ni montaje posterior de stickers.
- El resultado mantiene el formato configurado, actualmente 4:5 a 1080×1350. Se registran proveedor, endpoint, versión del prompt y referencias efectivamente enviadas, sin exponer URLs temporales o credenciales.
- Fallos, incompatibilidad o límites del proveedor producen un error o alternativa explícita permitida por la política; no se omiten referencias solicitadas silenciosamente ni se reintenta sin límites.

### BRAND-05 — Guardar referencias en el draft y sus versiones

**Historia:** [BRAND-05](../stories/BRAND-05.md)

**Como** editor, **quiero** guardar referencias en el draft y sus versiones, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-04

**Criterios de aceptación**

- Cada unidad guarda un snapshot de referencias seleccionadas: ID, versión, hash, función e instrucciones de uso. Cada ejecución registra además el conjunto efectivamente enviado y lo vincula al asset resultante.
- Cambiar un archivo o sus instrucciones crea una nueva revisión de biblioteca. Un draft existente no adopta silenciosamente esa revisión ni pierde la referencia que explica su imagen.
- Las entradas del hash de generación incluyen referencias y sus instrucciones, de modo que cambios reales invaliden la caché correspondiente.
- Actualizar deliberadamente referencias de un draft crea una nueva versión y deja los resultados afectados pendientes de revisión; no modifica assets históricos ni regenera todas las unidades.
- Respuestas tardías se vinculan a la versión que las solicitó y no reemplazan selecciones o aprobaciones más recientes.

### BRAND-06 — Reutilizar referencias al editar una imagen

**Historia:** [BRAND-06](../stories/BRAND-06.md)

**Como** editor, **quiero** reutilizar referencias al editar una imagen, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-05; integración con IMG-01 a IMG-08

**Criterios de aceptación**

- Al modificar una imagen individual se recuperan sus referencias guardadas y las instrucciones de marca, junto con la imagen base y la petición de cambio, dentro de los límites del proveedor.
- El editor puede mantener, quitar o sustituir referencias para esa unidad; la decisión queda persistida y no afecta automáticamente al resto del carrusel.
- El cambio crea una nueva versión de la imagen con linaje hacia su base. La aprobación anterior no aprueba el resultado nuevo y las demás imágenes conservan su historial.
- Si una referencia histórica está desactivada o ya no es elegible para transmisión, el sistema conserva el snapshot pero no la reenvía; explica la limitación sin reemplazarla silenciosamente.
- No se promete edición localizada perfecta: una solicitud pequeña puede alterar otros detalles en image-to-image y el resultado necesita revisión.

### BRAND-07 — Revisar el resultado con su contexto visual

**Historia:** [BRAND-07](../stories/BRAND-07.md)

**Como** editor, **quiero** revisar el resultado con su contexto visual, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-05

**Criterios de aceptación**

- La revisión final muestra resultado, referencias utilizadas, instrucciones y exclusiones relevantes por unidad. Permite corregir y relanzar conservando la trazabilidad.
- La preparación no introduce aprobaciones de selección, análisis o referencias por publicación. La única decisión humana sobre el resultado se mantiene al final del recorrido aplicable.
- Una referencia activa no equivale a una publicación aprobada. Aprobación y futura publicación se vinculan al conjunto exacto de texto e imágenes revisado.
- La política de fotografía real obligatoria sigue excluyendo generación del lugar. Las referencias de marca no prueban identidad geográfica ni habilitan modificar fotografías documentales mediante IA.
- Cambiar la biblioteca no altera publicaciones existentes. Una revocación de uso bloquea nuevas transmisiones y exige revalidar entregas pendientes afectadas, conservando el histórico.

### BRAND-08 — Validar referencias de marca y regresiones

**Historia:** [BRAND-08](../stories/BRAND-08.md)

**Como** editor, **quiero** validar referencias de marca y regresiones, **para** producir imágenes coherentes con la marca y conservar sus decisiones visuales.

**Prioridad:** P0 · **Dependencias:** BRAND-06 y BRAND-07

**Criterios de aceptación**

- Fixtures incluyen post terminado, sticker transparente, señalética con texto francés y lámina con 30 motivos; verifican que llegan como imágenes al adaptador y con su función correcta.
- Pruebas cubren aislamiento entre temas, archivo inválido, permisos insuficientes, límites conjuntos con protagonistas, biblioteca vacía y fallos o timeout del proveedor.
- Pruebas de versiones cubren cambio de referencia, edición de una sola unidad, caché, respuesta obsoleta y conservación de aprobaciones históricas sin aprobar nuevas imágenes.
- Se verifica que fotografía obligatoria nunca invoque el generador a causa de esta biblioteca y que OCR o instrucciones dentro de una imagen no modifiquen las políticas.
- La validación visual final del piloto compara coherencia de marca e identidad del protagonista en posts y carruseles; registra alteraciones de textos y motivos. Los mocks no sustituyen esta validación con el proveedor configurado.
- Pasan pruebas relevantes, lint y build; db:check si la implementación requiere migraciones. Bloqueos del entorno y validación pendiente quedan documentados.

## Decisiones técnicas para implementación

- Reutilizar servicios de referencias, R2 privado, proveedores y versionado existentes, manteniendo la entidad de referencia de marca separada de personajes. Elegir persistencia tras revisar el modelo; no prescribir una migración si los snapshots existentes bastan.
- Mantener credenciales, lecturas privadas y llamadas al proveedor en servidor. Si requiere URLs temporales, limitar su vigencia y no persistirlas como identidad del material.
- Verificar límites reales del endpoint configurado antes de implementar el reparto entre imagen base, protagonistas y marca. No asumir cantidad ilimitada de imágenes ni soporte idéntico entre proveedores.
- Versionar tanto las instrucciones explícitas como cualquier análisis usado en selección; cachear por hash y versión del analizador. Acotar tiempo, coste y reintentos.
- Conservar la diferencia entre referencia disponible, elegible para envío, utilizada en una ejecución y resultado aprobado.

## Validación y estado

Documento de alcance: ninguna de estas historias se declara implementada. La aceptación requiere pruebas de integración y revisión visual final con material del piloto. El tablero y las historias individuales deben actualizarse junto con este documento si cambia el alcance.
