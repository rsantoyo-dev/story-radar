# Feature: Hook + pasos — secuencias genéricas

**ID:** FEAT-RCP-001  
**Estado:** Implementación disponible; pendiente QA integrado con proveedor.  
**Tablero:** [recipe-carousel.kanban.md](recipe-carousel.kanban.md)

## Objetivo y alcance

Convertir una noticia preparada, recogida por RSS o creada manualmente, en un draft con un hook atractivo y una secuencia de pasos. Aplica a recetas, montaje, tutoriales y otros procedimientos. Chez Ricard es un ejemplo de prueba, no una condición de código. Se conservan los IDs RCP y los nombres de archivo para mantener enlaces.

El flujo sigue siendo **Story Review → Creative Brief → Draft → aprobación → imágenes → revisión → publicación**. El perfil creativo existente permite elegir **Automatic** o **Hook + steps**. No se agregan RecipeSource, RecipeBrief, perfiles culinarios ni un modo de topic. Esta especificación sustituye completamente la propuesta anterior de recetas.

## Comportamiento

- `storyStructure: auto`: elección del formato según fuente; las noticias mantienen el flujo habitual.
- `storyStructure: hook-steps`: preferir `sequence` si la fuente contiene un procedimiento respaldado. La preferencia llega al brief.
- `sequence`: usa carouselPlan, unidades carousel-slide, edición, referencias, versiones y aprobaciones existentes; 3–8 slides y formato de imágenes configurado (feed habitual 1080×1350).
- Sin instrucciones suficientes: carrusel explicativo y motivo en riskFlags. No fabricar materiales, cantidades, tiempos ni pasos.
- Para aplicar la preferencia a trabajo existente: guardar perfil y crear un brief nuevo; no reescribir drafts históricos automáticamente.

## Composición del draft

| Parte | Resultado esperado |
|---|---|
| Portada | Hook concreto sobre el resultado y una invitación a deslizar. |
| Requisitos | Ingredientes, materiales o preparación necesarios respaldados por la fuente. |
| Pasos | Acciones en orden; conservar cantidades y condiciones. Agrupar solo cuando siga siendo claro y completo. |
| Cierre | Resultado que cumple la promesa y CTA configurado: guardar, seguir, compartir o conversar. |

La estética, idioma, voz, personajes y referencias vienen del perfil. La UI usa UXDSL, paleta dinámica, density(), tipografía y breakpoints existentes. El draft sigue siendo editable y requiere aprobación humana.

## Límites y revisión del código

La revisión factual de carrusel se aplica a sequence. Aún debe probarse con el proveedor que las reparaciones conservan todos los pasos y requisitos: los límites existentes de hechos y texto pueden comprimir procedimientos largos. No se ha implementado un verificador especializado de completitud ni una certificación culinaria/técnica.

Las migraciones 0061–0066 conservan el historial del intento anterior: crean y después eliminan tablas experimentales. No son el diseño vigente. Como ya se aplicaron en desarrollo, no se renumeran ni reescriben; sus DROP son relevantes para cualquier entorno que contenga datos de ese experimento. 0067 agrega solamente story_structure al perfil. Los snapshots intermedios heredados no reflejan todas las eliminaciones manuales; el snapshot 0067 refleja el esquema final.

El script seed-test-recipe-story.mjs inserta una fixture de desarrollo con URL example.org. No usar su contenido como fuente verificada ni como flujo manual de producción. No se ejecutó durante esta revisión.

## Validación y entrega

La revisión anterior pasó 606 pruebas stories/meta, lint, build y db:check. Falta QA real: receta manual, tutorial RSS, noticia auto y fuente incompleta, incluyendo generación de imágenes y revisión responsive. No se realiza publicación automática para probarlo.

## Historias

- [RCP-01 — Preferencia de estructura en el perfil](../stories/RCP-01.md): Implementado; pendiente QA de interfaz.
- [RCP-02 — Contrato genérico sequence](../stories/RCP-02.md): Implementado; pendiente QA integrado.
- [RCP-03 — Reutilizar entradas RSS y manuales](../stories/RCP-03.md): Pendiente QA.
- [RCP-04 — Crear el brief desde la preferencia](../stories/RCP-04.md): Implementado; pendiente prueba con proveedor.
- [RCP-05 — Hook, requisitos, pasos y resultado](../stories/RCP-05.md): Implementado; pendiente prueba con proveedor.
- [RCP-06 — Revisión factual y conservación del procedimiento](../stories/RCP-06.md): Pendiente QA semántico.
- [RCP-07 — Edición y aprobación compartidas](../stories/RCP-07.md): Implementado; pendiente QA de interfaz.
- [RCP-08 — Imágenes y referencias de la marca](../stories/RCP-08.md): Implementado; pendiente generación real.
- [RCP-09 — Revisión y publicación existentes](../stories/RCP-09.md): Implementado; pendiente QA integrado.
- [RCP-10 — Regresión completa y cierre](../stories/RCP-10.md): Pendiente QA.
- [RCP-11 — Propuestas desde una idea](../stories/RCP-11.md): Fuera de fase 1.

## Firma tipográfica de marca

La identidad visual puede incluir un bloque `BRAND_LETTERING` con un array JSON de hasta tres líneas explícitamente aprobadas (máximo 120 caracteres por línea). El generador las incorpora al contrato de texto visible solo en portada y cierre, respetando su idioma original. No infiere lemas de fotografías o referencias. Con overlay PNG habilitado se omite la firma tipográfica para evitar duplicación. Es una capacidad genérica por perfil, no exclusiva de sequence ni de Chez Ricard.

Ejemplo de configuración dentro de visual guidance:

```text
<BRAND_LETTERING>["Nombre de marca","Subtítulo","Lema"]</BRAND_LETTERING>
```

El estilo se describe en el resto de la identidad visual. Los briefs guardan snapshots: crear un brief nuevo para adoptar una configuración nueva. La tipografía generada requiere revisión visual; no garantiza reproducir una fuente exacta.

## Nombre obligatorio en portada

En Topic voice, `Show content name on cover` activa `requireCoverTitle` (false por defecto). El brief propone `contentTitle` en el idioma del perfil; si no lo devuelve, la generación usa el título de la historia como respaldo. La portada conserva el hook como headline y el nombre como subheadline, editable en `Content name on cover (required)`. Guardar y aprobar conservan ese nombre; si se vacía y el brief tiene nombre, lo restauran. El campo viaja en el contrato de texto visible de generación de imágenes. No se imponen marcas ni reglas culinarias específicas.

La migración 0068 añade la preferencia y el nombre del brief. Chez Ricard tiene la opción activada. Crear un brief nuevo para usarla: los snapshots anteriores no cambian. La generación real y la legibilidad de la portada siguen pendientes de QA con proveedor.
