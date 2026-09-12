# RCP-03 — Reutilizar entradas RSS y manuales

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Pendiente QA  
**Dependencias:** RCP-01

## Historia

Como editor, quiero reutilizar entradas rss y manuales, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Abrir la misma Story Review para contenido RSS o manual, sin RecipeSource ni formulario culinario paralelo.
- Usar contenido preparado y procedencia existentes como evidencia; no inventar URL, autor ni publicación.
- Una fuente sin instrucciones completas no debe transformarse en una receta o montaje inventado.

## Implementación y evidencia

Flujo existente; scripts/seed-test-recipe-story.mjs es solo una utilidad de desarrollo, no la entrada manual de producto.

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
