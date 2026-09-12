# RCP-05 — Hook, requisitos, pasos y resultado

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente prueba con proveedor  
**Dependencias:** RCP-04

## Historia

Como editor, quiero hook, requisitos, pasos y resultado, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Portada: resultado concreto y deseo de deslizar. No gastar la portada en instrucciones.
- Centro: materiales o ingredientes necesarios y pasos en orden, con cantidades y condiciones respaldadas. Agrupar pasos adyacentes sin omitir requisitos.
- Cierre: resultado y CTA configurado. No convertir el cierre en otro paso ni imponer followers si se eligió saves.
- Si el procedimiento no cabe legiblemente en los límites existentes, señalar el límite para revisión; no afirmar que el sistema garantiza una receta completa automáticamente.

## Implementación y evidencia

sequencePolicy y DRAFT_SYSTEM_INSTRUCTION; carouselPlan existente

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
