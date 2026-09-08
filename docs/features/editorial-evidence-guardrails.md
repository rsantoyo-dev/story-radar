# Hechos suficientes y representación documental

**Estado:** Protecciones iniciales implementadas; validación hiperlocal y corrección del caso real pendientes.
**Relacionadas:** [Fidelidad de lugares reales](real-place-visual-fidelity.md), [Edición de imágenes](creative-image-editing.md).

## Problema

El ejemplo de Saint-Sébastien y Saint-Jean-sur-Richelieu contiene tramos y números de salida, pero el guion admite que no conoce la naturaleza ni los efectos del aviso. Esto no basta para una noticia vial. Un generador tampoco puede convertir esos fragmentos en un mapa fiable. Una advertencia de incertidumbre no demuestra que no existan obras.

## Plan y avance

1. **Comprobar suficiencia antes de generar — implementado para señales explícitas.** Un brief insuficiente o compuesto solo de fragmentos de localización vial se bloquea antes de generar el guion. La revisión de calidad detecta el caso compartido y declaraciones explícitas de insuficiencia en el texto visible. El editor puede guardar correcciones; no aprobar o generar con esos bloqueos.
2. **Impedir reconstrucciones geográficas — protección inicial implementada.** Instrucciones explícitas de mapas esquemáticos, tramos viales o plazas públicas se excluyen del generador, incluso en modo ilustración. Se comprueban las instrucciones del guion y las ediciones de imagen; aprobación y descarga también comprueban los bloqueos pertinentes. Esto no verifica automáticamente toda mención de cualquier lugar: la detección es conservadora y basada en patrones, no una certificación semántica.
3. **Usar el recorrido documental — existente, con bloqueo adicional.** Consultar originales elegibles o cartografía del proveedor configurado; tipografía cuando hay hechos suficientes sin material verificable. Los fragmentos viales sin evento identificado terminan bloqueados en la revisión final, sin gastar extracción de lugares ni consultar foto/mapa. Se versiona la regla en la clave de caché para no reutilizar una preparación anterior como vigente.
4. **Resolver este incidente concreto — pendiente del enlace de fuente o ID del draft.** Recuperar el artículo/aviso completo, identificar carretera, tramo, sentido, fechas y tipo de intervención cuando correspondan. Corregir el brief y producir una revisión nueva, conservando la anterior. No modificar una publicación remota ni aprobar automáticamente. El texto pegado por el usuario no identifica por sí solo el registro de la aplicación.
5. **Validar con casos locales — pendiente.** Incluir noticias completas, avisos tabulares truncados, homónimos, desmentidos sustentados y fuentes que expresen incertidumbre parcial. Medir falsos positivos y omisiones. No prometer precisión del 100 % por un score del modelo ni por pasar pruebas simuladas.

## Funcionamiento editorial

- Hechos insuficientes → bloqueo con motivo. No rellenar tres slides describiendo lo que falta.
- Hechos suficientes + fotografía elegible → composición sobre el original con evidencia y condiciones de uso.
- Hechos suficientes + ubicación verificada + cartografía autorizada → mapa como localización; nunca como prueba de obras, cierres o estado actual.
- Hechos suficientes sin foto/mapa verificables → tipografía.
- Una sola revisión humana final; no publicación ni aprobación automática.

La selección foto/mapa/tipografía pertenece al recorrido documental existente. El recorrido de ilustración devuelve un conflicto cuando detecta una reconstrucción: esta entrega no lo redirige automáticamente ni relaja su política. Para una marca que exige material real, debe configurarse fotografía obligatoria previamente; no se cambió ninguna marca sin identificar su tema.

## Implementación

`creative-evidence-guardrails.ts` concentra reglas compartidas por el brief, la calidad editorial, los assets y la preparación documental. Las reglas reconocen señales en francés, inglés y español, con normalización de acentos. No inventan hechos, URLs, coordenadas ni licencias; tampoco realizan verificación independiente de una fuente.

Pruebas incluyen el guion reportado, fragmentos de kilómetros/salidas, un cierre con evidencia concreta, instrucciones de mapa/tramo y la rama documental bloqueada sin llamadas al modelo/proveedor. No se modificaron credenciales, proveedores ni esquema de base de datos.

**Validación local:** pasan 443 pruebas de la suite completa y, después, 23 pruebas focalizadas con el nuevo caso documental bloqueado. Lint y build (incluido TypeScript) pasan. No se llamó al generador real ni se verificó el post original.

## Corrección del incidente Québec 511

La inspección del contenido importado mostró que **la fuente sí conservaba ruta, entrave, dirección y fechas**. El brief había reducido las citas a la ubicación; su reparación de evidencia eliminó después los datos que no estaban en esas citas parciales. No era correcto atribuir la insuficiencia a Québec 511.

`road-notice-evidence.ts` reconoce registros tabulares completos con ruta, ubicación, categoría, dirección y período. La reparación del brief amplía una cita de ubicación solo cuando corresponde de manera única a un registro completo de hasta 500 caracteres. Conserva la cita literal; no mezcla filas repetidas ni convierte “entrave majeure” en “fermeture partielle”. El prompt del brief pasa a v25 para invalidar la caché anterior.

En el contenido inspeccionado, la notice A-35 de Saint-Sébastien termina el 9 de octubre de 2026; la de Saint-Jean-sur-Richelieu termina el 31 de octubre. Estos datos describen ese snapshot: la página regional es dinámica y debe volver a comprobarse para publicaciones posteriores.

La préparation documentaire sait désormais sélectionner un registre 511 unique par route et date de fin présentes dans le titre. En cas de plusieurs correspondances, elle ne choisit pas arbitrairement. Pour un registre identifié, elle compose trois extraits contigus (lieu, entrave/direction, période) sans modèle ni image géographique générée. Ce mécanisme concerne les hôtes officiels 511 et ne prétend pas identifier une photo du lieu.

Exécution du correctif sur le cas signalé : la régénération générale du brief a échoué sur les citations retournées par les fournisseurs; aucune approbation n’a été contournée. La préparation documentaire déterministe a ensuite réussi et enregistré le draft `1c5d469a-331b-4e95-a548-91c092d05aa8`, avec trois assets générés, non approuvés, et leur source 511. Le draft précédent est conservé.

### Corrección de la preparación normal de briefs 511

La acción normal de generar brief reconoce ahora un único registro completo de la fuente oficial que coincide con ruta y fecha de fin del título. Persiste el brief extractivo con `provider=quebec511`, sin llamadas al modelo ni consumo de tokens. El título sirve para seleccionar el registro; sus afirmaciones sobre cierres no se convierten en hechos. Si hay varios registros compatibles, este adaptador no selecciona ninguno. La reparación de citas tolera espacios normalizados y conserva como evidencia el registro original exacto, incluido el número de ruta.

Validación: 450 pruebas, lint, TypeScript y build pasan. La petición normal de la noticia `96599011-1465-40d0-b1a0-5bd51f168727` devolvió HTTP 200 y `provider=quebec511` en localhost. Esta corrección cubre el brief: el generador creativo tradicional de guiones sigue dependiendo de proveedores. La publicación documental preparada sigue siendo el recorrido sin generación artificial del lugar y requiere revisión final humana.

El brief estructurado incluye ahora un plan de carrusel con IDs de hechos explícitos. Para los briefs `quebec511/structured-notice-v1` ya guardados sin plan, la lectura recupera el mismo plan únicamente cuando conserva sus tres hechos y una evidencia común. No modifica el histórico ni requiere regenerar el brief. El plan pasa el validador narrativo, incluido el requisito de no introducir hechos nuevos en el cierre.

### Visibilidad del bloqueo geográfico en imágenes

La etapa de imágenes muestra los errores junto a sus controles. Si un guion sin lote pide reconstrucción geográfica, identifica las unidades afectadas y ofrece abrir la preparación documental en vez de ofrecer una generación que el servidor rechazará. Abrir ese panel no transforma ni aprueba el guion existente: la pieza documental conserva su revisión final independiente. Comprobado con la dirección visual del borrador `973cf5b0-9e10-47a7-9dd7-5fd9be2d0a33`, cuya portada solicita una carta routière de un tramo real.
