# Feature: Recipe Carousel — Chez Ricard

**ID:** FEAT-RCP-001  
**Estado:** Planificado — sin implementación iniciada  
**Fecha:** 11 de septiembre de 2026  
**Producto:** Press Craftor  
**Tablero:** [recipe-carousel.kanban.md](recipe-carousel.kanban.md)

## Objetivo

Convertir una receta propia o importada en un carrusel que atraiga con un hook y un plato apetitoso, invite a deslizar y enseñe la preparación completa en las imágenes siguientes. Chez Ricard es el primer topic de prueba, con identidad culinaria Colombia–Québec; el formato debe servir a otros topics sin condiciones por nombre o UUID.

## Flujo y alcance

Receta aportada/URL → Recipe Brief → Recipe Carousel Draft → revisión y aprobación → referencia del plato e imágenes → revisión visual → paquete/publicación Instagram existente.

Fase 1: recetas aportadas por el editor o importadas, edición estructurada, hooks, carruseles de unas seis slides, validación culinaria, imágenes y entrega mediante el flujo existente. Propuesta de rango: cuatro a ocho slides; RCP-05 confirma compatibilidad con los límites del modelo y la interfaz. Nunca truncar pasos para cumplir un número de slides.

Fase 2: propuestas originales por IA desde una idea, explícitamente pendientes de revisión y prueba culinaria (RCP-11).

Fuera de alcance: nutrición calculada, escalado automático de porciones, recetas personalizadas médicamente, planificación de menús, nueva programación social, Facebook y video. Video Draft puede recibir esta entrada en otra feature; no es una dependencia para publicar el carrusel.

No se crea un pipeline de publicación independiente. Se reutilizan perfil de marca, personajes opcionales, generación fal, referencias privadas, aprobaciones, versiones y paquetes de Instagram. El formato de receta selecciona sus propias reglas editoriales; no se exige actualidad periodística ni una fuente URL inventada para una receta propia.

## Caso de referencia: Poutine de papa criolla con sobrebarriga

La referencia compartida por el usuario inspira fotografía cálida, papel/carteles, identidad de marca y secuencia de preparación. No es una receta validada: contiene Russet pese al título de papa criolla y no desarrolla suficientemente la preparación de las papas. Ambos casos son regresiones obligatorias. No copiar esas inconsistencias.

| Slide | Función | Contenido esperado |
|---|---|---|
| 1 | Hook | Plato terminado protagonista, marca como firma. Ejemplo editorial: «¿Y si la poutine tuviera corazón colombiano?» e invitación a deslizar. |
| 2 | Ingredientes | Porciones e ingredientes agrupados; cantidades procedentes del brief confirmado. |
| 3 | Sobrebarriga | Preparación de la carne y señales del resultado, sin inventar tiempos. |
| 4 | Gravy | Ingredientes, preparación y uso del líquido de cocción. |
| 5 | Papas y montaje | Cómo preparar la papa criolla y montar el plato; dividir en dos slides si no cabe. |
| 6 | Cierre | Resultado, invitación a guardar y seguir; pregunta opcional sobre la siguiente receta. |

El ejemplo define narrativa, no cantidades ni instrucciones culinarias definitivas. Esos datos deben aportarse o confirmarse en el brief. El hook debe prometer algo que las slides siguientes entreguen.

## Componentes propuestos

| Componente | Responsabilidad |
|---|---|
| RecipeProfileSettings | Tipo editorial, identidad culinaria, idioma, audiencia y objetivos dentro del perfil existente. |
| RecipeSourceEditor | Receta manual o importada, procedencia y fotografía propia opcional. |
| RecipeBriefEditor | Porciones, grupos de ingredientes, cantidades, pasos relacionados, tiempos y campos pendientes. |
| RecipeHookSelector | Variantes de portada y edición manual, sin generar imágenes al seleccionar. |
| RecipeCarouselOutline | Orden de slides, roles y cobertura de todos los pasos de la receta. |
| RecipeReviewPanel | Bloqueos concretos, reparación y acceso al dato de origen. |
| DishReferencePanel | Foto o propuesta visual revisada del plato; versión, permisos y uso por slide. |
| RecipeImageReview | Comparación con el brief, revisión de texto y regeneración individual en el workspace existente. |

Contemplar loading, error recuperable, entrada incompleta, vacío, guardado, versión obsoleta y aprobado. No realizar llamadas pagadas al abrir un panel. Botones claros: Guardar receta, Preparar brief, Crear carrusel, Aprobar draft y Generar imágenes.

## Contrato de información y confianza

- Fuente: texto/URL opcional, método de entrada, autor cuando se conozca y fecha de ingreso.
- Receta: título, porciones, ingredientes con IDs y unidades, pasos con IDs y relaciones, componentes y datos pendientes.
- Narrativa: hook seleccionado, roles, referencia a pasos/ingredientes, continuidad, CTA y idioma.
- Visuales: referencia de plato y marca versionadas, estado de preparación representado y permisos.
- Aprobaciones: separadas para brief/draft e imágenes; ninguna implica prueba real en cocina.
- Cambios: preservar históricos y marcar dependencias obsoletas. Regenerar una slide mantiene la receta y sus referencias actuales.

El validador determinista comprueba estructura y consistencia; la IA puede ayudar a reparar con evidencia disponible. Ninguno garantiza sabor, calidad culinaria o seguridad por sí solo. Una incertidumbre no se resuelve inventando una cantidad para poder aprobar.

## Diseño y compatibilidad

UXDSL es obligatorio para todos los componentes, incluyendo estados de error y revisión: paleta dinámica, density() como spacing responsive, breakpoints y primitivas existentes. Separar estilos de lógica y markup. La interfaz hereda el topic; la estética cálida de Chez Ricard pertenece a sus referencias de marca, no a una paleta fija de toda la app.

Mantener el formato actual de imagen 4:5, 1080×1350. La referencia común da continuidad visual, pero cada fase muestra su estado culinario apropiado. Revisión humana obligatoria porque la IA puede alterar ingredientes y texto.

## Entrega por historias

- [RCP-01 — Definir el modo recetas y su contrato versionado](../stories/RCP-01.md) · P0.
- [RCP-02 — Configurar identidad culinaria y objetivos de Chez Ricard](../stories/RCP-02.md) · P0.
- [RCP-03 — Crear o importar una receta propia](../stories/RCP-03.md) · P0.
- [RCP-04 — Construir y editar Recipe Brief](../stories/RCP-04.md) · P0.
- [RCP-05 — Generar hook y estructura narrativa del carrusel](../stories/RCP-05.md) · P0.
- [RCP-06 — Validar y reparar coherencia culinaria del draft](../stories/RCP-06.md) · P0.
- [RCP-07 — Editar y aprobar el Recipe Carousel Draft](../stories/RCP-07.md) · P0.
- [RCP-08 — Generar imágenes consistentes con el plato y la marca](../stories/RCP-08.md) · P0.
- [RCP-09 — Revisar imágenes y publicar con el flujo existente](../stories/RCP-09.md) · P0.
- [RCP-10 — Validar el recorrido completo y documentar la entrega](../stories/RCP-10.md) · P0.
- [RCP-11 — Desarrollar propuestas de receta desde una idea](../stories/RCP-11.md) · P1.

## Criterio de finalización de fase 1

Receta propia de Chez Ricard llega a un paquete de Instagram aprobable con todos los pasos representados, sin sustitución de ingredientes, hooks respaldados y coherencia visual revisada. Evidencia de aislamiento de topics, regresión de noticias y validación responsive. Publicar requiere orden explícita; completar la feature no publica automáticamente.
