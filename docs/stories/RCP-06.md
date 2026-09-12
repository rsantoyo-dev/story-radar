# RCP-06 — Revisión factual y conservación del procedimiento

**Feature:** [FEAT-RCP-001](../features/recipe-carousel.md)  
**Estado:** Pendiente QA semántico  
**Dependencias:** RCP-05

## Historia

Como editor, quiero revisión factual y conservación del procedimiento, para crear secuencias útiles dentro del flujo creativo existente.

## Criterios de aceptación

- Aplicar las revisiones y reparaciones de carrusel a sequence, sin saltarse evidencia ni aprobaciones.
- Verificar que las reparaciones no borran cantidades, requisitos o pasos y que el orden permanece ejecutable.
- Probar una receta y un tutorial no culinario; un título sobre papa criolla no debe transformarse en papas Russet sin respaldo.
- No afirmar validación culinaria, técnica ni prueba práctica. No existe un validador especializado nuevo en esta entrega.

## Implementación y evidencia

creative-quality.ts; revisiones existentes. Pendiente comprobar conservación semántica tras reparación.

## Condiciones compartidas

Mantener aislamiento por topic, versiones, evidencias y aprobación humana. Sin reglas por marca ni contratos exclusivos de recetas. Toda UI nueva usa UXDSL y la paleta dinámica existente. Una prueba automatizada no sustituye la revisión del procedimiento generado.
