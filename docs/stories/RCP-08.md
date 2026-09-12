# RCP-08 — Imágenes y referencias de la marca

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Implementado; pendiente generación real  
**Dependencias:** RCP-07

## Historia

Como editor, quiero imágenes y referencias de la marca, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Generar desde el draft aprobado con los mismos proveedores, referencias y dimensiones configuradas.
- Aplicar paginación y sistema visual de carrusel a sequence; usar identidad del perfil sin reglas Chez Ricard.
- Revisar coherencia entre imagen y paso, texto, cantidades y resultado; no confundir foto original con imagen generada.
- La preparación documental standalone existente es distinta de generar el draft paso a paso; su selección de extractos no garantiza cubrir un procedimiento.

## Implementación y evidencia

build-creative-image-prompt.ts; manage-creative-documentary.ts; instagram-gallery-panel.tsx

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
