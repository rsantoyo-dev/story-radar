# RCP-10 — Regresión completa y cierre

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Pendiente QA  
**Dependencias:** RCP-01 a RCP-09

## Historia

Como editor, quiero regresión completa y cierre, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Probar receta manual y tutorial RSS, noticias auto y contenido incompleto con hook-steps.
- Verificar persistencia del perfil, brief nuevo, draft, edición, reparación, aprobación y generación de imágenes.
- Validar en móvil y escritorio, con dos paletas de topic, conservando densities y breakpoints.
- Registrar resultado real del proveedor, coste cuando corresponda, y defectos; cerrar solo después del recorrido.

## Implementación y evidencia

606 pruebas stories/meta, lint, build y db:check pasaron en la revisión anterior; no equivale a QA real del proveedor.

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
