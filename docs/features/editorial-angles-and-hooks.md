# Feature: Ángulos editoriales y hooks de adquisición

**ID:** FEAT-ANGLE-001  
**Estado:** Planificado — P0  
**Tablero:** [editorial-angles-and-hooks.kanban.md](editorial-angles-and-hooks.kanban.md)  
**Relación:** [Hooks claros con selección editorial verificable](editorial-hook-selection.md), [Daily editorial planner](daily-editorial-planner.md), [Instagram performance](instagram-performance.md)

## Problema

Los drafts actuales pueden ser correctos, claros y visualmente atractivos, pero todavía pueden abrir como titulares de industria: anuncian quién dijo algo antes de explicar qué cambió, por qué es inesperado o por qué debería importarle a una persona fuera de la burbuja AI.

La mejora debe hacer que el draft elija el mejor ángulo respaldado por la noticia y que el hook convierta ese ángulo en una promesa concreta. No se debe fabricar una consecuencia personal cuando la fuente no la demuestra.

## Resultado esperado

Cada brief nuevo conserva el `Editorial Priority` y el `Growth Score`, pero además identifica un ángulo editorial principal:

- `everyday-impact` — herramientas, empleo, dinero, educación y privacidad que cambian algo para la audiencia;
- `wtf-capability` — capacidades nuevas o comportamientos inesperados;
- `power-shift` — reemplazos, despidos, control corporativo o cambios de poder;
- `risk-explainer` — fraude, seguridad, regulación y riesgos comprensibles;
- `industry-deep-dive` — agents, arquitectura, research y policy para una audiencia más especializada.

Los porcentajes son un objetivo de cartera para la grilla, no una regla para cada historia:

| Ángulo | Objetivo de cartera |
| --- | ---: |
| `everyday-impact` | 40% |
| `wtf-capability` | 20% |
| `power-shift` | 15% |
| `risk-explainer` | 15% |
| `industry-deep-dive` | 10% |

Para una historia individual, la evidencia y la claridad tienen prioridad sobre la cuota. El planner debe poder devolver “sin ángulo fuerte” o recomendar otra historia.

## Decisiones de diseño

- `editorialAngle` describe el motivo de adquisición de la historia; `framingStrategy` continúa describiendo cómo se escribe (`reader-consequence`, `explainer`, `authority` o `auto`). No se deben mezclar ambos conceptos.
- El sistema conserva la selección actual de tres hooks, sus hechos, checks y unidad de respuesta. Esta feature amplía la decisión; no crea una segunda llamada fija solo para generar hooks.
- El hook seleccionado debe revelar el sujeto y la acción, introducir una consecuencia, contraste, sorpresa o capacidad concreta y prometer una respuesta que exista en el carrusel.
- “¿Por qué me afecta?” solo se usa si los hechos respaldan algo que la audiencia usa, paga, decide, aprende o puede sufrir. Si no, se usa lenguaje de utilidad general o explicación.
- El modelo puede seleccionar un hook sobrio para una noticia útil. No se exige miedo, indignación, segunda persona ni tensión artificial.
- Los ángulos, razones y hooks son metadatos editoriales. No aparecen en la imagen salvo el texto aprobado del draft.
- Los drafts y revisiones históricas no se reescriben en segundo plano.

## Flujo

1. El brief analiza los hechos permitidos y clasifica la historia en un ángulo principal y, opcionalmente, un ángulo alternativo.
2. El brief explica qué audiencia no especializada puede encontrarla relevante y cuál es la promesa de lectura.
3. La generación produce tres aperturas distintas: capacidad/sorpresa, consecuencia/utility y tensión/contraste cuando estén respaldadas.
4. La selección existente valida claridad, respaldo, lenguaje humano, consecuencia y curiosidad.
5. El planner compara las candidatas del día con las últimas publicaciones y favorece la variedad de ángulos sin sobreescribir los scores originales.
6. El editor puede revisar ángulo, razón, candidatos y selección antes de aprobar el draft.

## Tareas

### ANGLE-01 — Definir el contrato de ángulos

**Prioridad:** P0 · **Dependencias:** ninguna

- Añadir un tipo cerrado para los cinco ángulos y parser de valores desconocidos.
- Definir el comportamiento de compatibilidad para briefs históricos sin ángulo.
- Mantener `Growth Score` como estimación de adquisición, sin convertirlo en una predicción de viralidad.
- Documentar que la cuota 40/20/15/15/10 se aplica al conjunto de publicaciones y no obliga a una historia concreta.

### ANGLE-02 — Clasificar la noticia a partir de evidencia

**Prioridad:** P0 · **Dependencias:** ANGLE-01

- Actualizar el contrato del brief para devolver `editorialAngle`, `angleReason`, `audienceStake` y `hookPromise` o equivalentes explícitos.
- Exigir que la razón cite únicamente los hechos disponibles y preserve sus calificadores.
- Implementar fallback a `explainer`/`industry-deep-dive` cuando no exista una consecuencia personal sustentada.
- Impedir que palabras como “podría”, “reportado” o “estimado” se conviertan en certeza para mejorar el hook.

### ANGLE-03 — Mejorar la generación y selección del hook

**Prioridad:** P0 · **Dependencias:** ANGLE-02 · [HOOK-02/03](editorial-hook-selection.md)

- Mantener tres candidatos distintos y asociar cada uno con sus hechos permitidos.
- Pedir explícitamente una alternativa `wtf-capability` cuando la historia tenga una capacidad o comportamiento nuevo.
- Pedir explícitamente una alternativa `everyday-impact` solo cuando exista un stake verificable.
- Priorizar consecuencia o capacidad sobre el nombre de una organización y sobre verbos de anuncio genéricos.
- Conservar el requisito de claridad y evidencia y el mínimo de cuatro checks verdaderos.
- Invalidar el hook si promete una respuesta que ninguna unidad posterior entrega.

### ANGLE-04 — Usar los ángulos en la recomendación diaria

**Prioridad:** P0 · **Dependencias:** ANGLE-01, ANGLE-02

- Incorporar el ángulo y la distribución reciente al contexto seguro del daily planner.
- Favorecer ángulos subrepresentados solo después de considerar prioridad editorial, vigencia, evidencia y audience fit.
- Mostrar en la recomendación el ángulo elegido, su razón y la incertidumbre.
- No tratar el historial de publicaciones como evidencia de rendimiento.
- Mantener la opción explícita de “no hay candidato suficientemente fuerte”.

### ANGLE-05 — Mostrar la decisión editorial en el draft

**Prioridad:** P1 · **Dependencias:** ANGLE-02, ANGLE-03

- Mostrar ángulo, stake, promesa, hook elegido y alternativas en revisión.
- Mantener candidatos fuera del copy exportado y de la generación de imágenes.
- Marcar la evaluación como obsoleta cuando cambien hechos, brief, perfil o texto del draft.
- No aplicar una alternativa automáticamente.

### ANGLE-06 — Verificación automatizada y QA editorial

**Prioridad:** P0 · **Dependencias:** ANGLE-01 a ANGLE-04

- Añadir pruebas unitarias de parsing, fallback, clasificación y selección.
- Añadir pruebas de integración con respuestas de Gemini simuladas y fallback de proveedor existente.
- Añadir regresiones para drafts históricos, revisiones, hechos no permitidos y pérdida de calificadores.
- Preparar una muestra manual de al menos 20 noticias con representación de los cinco ángulos.

## Pruebas obligatorias para cerrar la feature

Estas pruebas deben pasar antes de marcar una tarea como hecha:

- Un brief válido devuelve exactamente un ángulo permitido.
- Una noticia sin consecuencia personal demostrada no puede recibir `everyday-impact` solo porque el prompt lo solicite.
- Una capacidad nueva respaldada puede recibir `wtf-capability` y produce un hook de capacidad concreto.
- El ángulo elegido no puede introducir hechos, causalidad, disponibilidad futura o certeza ausentes de la fuente.
- Los tres candidatos son distintos, usan hechos permitidos y el seleccionado coincide exactamente con la portada.
- Un hook con claridad falsa, evidencia falsa o menos de cuatro checks no se acepta automáticamente.
- El hook no puede prometer una respuesta que no exista en una unidad posterior.
- La recomendación diaria puede favorecer variedad sin mutar `Editorial Priority`, `Growth Score` ni decisiones previas.
- La cuota de cartera no fuerza un ángulo cuando no hay evidencia suficiente.
- Cambiar la historia o su evaluación invalida el resultado almacenado del planner.
- Un draft histórico sin `editorialAngle` sigue cargando y no recibe una reescritura silenciosa.
- Un fallo del proveedor no convierte un draft en aprobado ni elimina su comparación histórica.

## Comandos de validación

```text
npm test
npm run lint
npm run build
```

`npm run db:check` solo es obligatorio si la implementación introduce una migración. Se debe preferir el JSON versionado existente cuando pueda conservar el contrato sin alterar históricos.

## Definition of done

- Los nuevos drafts tienen ángulo, razón, stake y promesa estructurados.
- El planner considera la diversidad de ángulo.
- La selección de hooks conserva el contrato factual y las protecciones existentes.
- La UI permite revisar la decisión sin aplicarla silenciosamente.
- Pasan todas las pruebas obligatorias, lint y build.
- Se documenta la muestra manual de 20 historias y cualquier caso donde el sistema haya elegido fallback.
