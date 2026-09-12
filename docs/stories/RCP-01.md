# RCP-01 — Preferencia de estructura en el perfil

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente QA de interfaz  
**Dependencias:** ninguna

## Historia

Como editor, quiero preferencia de estructura en el perfil, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Guardar storyStructure como auto o hook-steps en el perfil creativo existente; auto es el valor por defecto y compatible con snapshots anteriores.
- Mostrar Story structure en Topic voice con controles UXDSL y paleta dinámica.
- El perfil elige presentación; no crea un tipo de topic ni una marca especial.

## Implementación y evidencia

creative-profile-panel.tsx; creative-profile.repository.ts; schema/creative-content.ts; migración 0067

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
