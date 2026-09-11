# RCP-01 — Definir el modo recetas y su contrato versionado

**Estado:** [[status-todo]] · **Feature:** [Recipe Carousel](../features/recipe-carousel.md)

**Prioridad:** P0 · **Dependencias:** ninguna

**Como** editor, **quiero** configurar un topic de recetas sin alterar el flujo de noticias, **para** preparar una receta útil y publicable sin perder control editorial.

## Criterios de aceptación

- Agregar un tipo editorial recipes configurable por topic; Chez Ricard es un perfil, no una condición hardcodeada.
- Definir RecipeSource, RecipeBrief, RecipeStep y RecipeSlide con IDs estables, versión y procedencia; decidir persistencia tras revisar repositorios existentes.
- Representar porciones, ingredientes con cantidad/unidad y grupo, pasos ordenados, ingredientes usados por paso, tiempos declarados y señales del resultado; distinguir desconocido de cero.
- Distinguir receta aportada por el editor, importada y propuesta por IA; revisión editorial no equivale a receta probada en cocina.
- Conservar versiones y snapshots; cambiar receta, referencias o instrucciones invalida las aprobaciones dependientes sin borrar el histórico.
- Mantener aislamiento de topics y comportamiento predeterminado de noticias; definir cómo un contenido propio entra en el modelo actual sin inventar un artículo periodístico.

## Contrato transversal de implementación

Reutilizar repositorios, aprobaciones, snapshots y assets existentes. Calls de IA, base de datos y archivos privados solo en servidor. Validar respuestas estructuradas antes de guardar. Definir migraciones únicamente tras comprobar qué puede representar el modelo existente.

Toda UI nueva o modificada usa UXDSL: paleta dinámica del topic mediante palette(), density() como espaciado responsive configurable, breakpoints existentes xs/sm/md/lg/xl, primitivas de tipografía, superficies, inputs, botones, radius(), border() y shadow(). CSS permanece separado de la lógica/JSX. No fijar la paleta culinaria como tema global ni introducir otra escala. La dirección artística de las imágenes se configura en la marca y no sustituye este contrato de interfaz.

## Evidencia para cierre

Registrar pruebas apropiadas, resultados, limitaciones y archivos modificados. En cambios visuales registrar revisión responsive y de paleta. Actualizar esta ficha y el kanban; no cerrar por existir código sin validar sus criterios.
