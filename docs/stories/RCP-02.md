# RCP-02 — Contrato genérico sequence

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente QA integrado  
**Dependencias:** RCP-01

## Historia

Como editor, quiero contrato genérico sequence, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Aceptar meme, carousel y sequence en esquema del proveedor, validadores y enum de base de datos.
- Sequence conserva unidades carousel-slide y límites existentes de 3–8 slides.
- La recomendación y alternativa son distintas y tienen exactamente una puntuación cada una. No exigir tres puntuaciones.

## Implementación y evidencia

creative-content.types.ts; gemini-creative-content-generator.ts; creative-format.test.ts

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
