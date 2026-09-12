# RCP-04 — Crear el brief desde la preferencia

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente prueba con proveedor  
**Dependencias:** RCP-01, RCP-02, RCP-03

## Historia

Como editor, quiero crear el brief desde la preferencia, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Pasar storyStructure al prompt del brief. Preferir sequence con hook-steps cuando existe procedimiento respaldado.
- Si faltan instrucciones, explicarlo en riskFlags y ofrecer carrusel explicativo.
- Conservar Creative Brief, evidencia y carouselPlan existentes; regenerar el brief para aplicar cambios de perfil.

## Implementación y evidencia

gemini-creative-content-generator.ts; creative-content.config.ts

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
