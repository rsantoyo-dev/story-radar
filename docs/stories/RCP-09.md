# RCP-09 — Revisión y publicación existentes

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente QA integrado  
**Dependencias:** RCP-08

## Historia

Como editor, quiero revisión y publicación existentes, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Aceptar sequence como carrusel de imágenes en validación Instagram.
- Exigir aprobación vigente del draft y de cada asset, evidencias, dimensiones y destino válidos.
- No agregar Facebook, programación ni publicación automática.

## Implementación y evidencia

instagram-publication-candidate.ts y pruebas

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
