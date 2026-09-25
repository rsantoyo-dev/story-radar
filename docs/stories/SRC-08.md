---
id: SRC-08
feature: FEAT-SRC-001
status: done
board: sources-and-story-creation.kanban.md
tags: [sources, done, p2]
---

# SRC-08 — Add source unificado con detección de tipo

**Estado:** [[status-done]] · **Feature:** [Fuentes y creación de historias](../features/sources-and-story-creation.md)

**Prioridad:** P2 · **Dependencias:** [[SRC-03]] · [[SRC-05]] · [[SRC-06]]

**Como** editor, **quiero** pegar una URL o soltar un archivo y que la app decida el tipo de fuente, **para** no elegir entre RSS, artículo o documento.

## Criterios de aceptación

- Detección en servidor: feed RSS o Atom, página de artículo, PDF; el resultado se confirma antes de crear nada.
- Cada tipo se encamina a su adaptador actual y produce una contribución normalizada según el contrato compartido de AGENTS.md; sin pipelines nuevos.
- Diseñar primero el contrato de contribución y sus pruebas; esta historia no arranca antes de cerrar SRC-03, SRC-05 y SRC-06.

## Requisito transversal de UXDSL

Componentes y estilos nuevos respetan el sistema UXDSL existente: `palette(...)`, `density(n)`, breakpoints `xs`–`xl`, `@ds-typo`, `@ds-surface`, `@ds-button`, `@ds-input`; sin colores fijos ni escalas nuevas. Reutilizar componentes existentes cuando cumplan el patrón.

## Implementación

`SourceContribution` conserva identidad externa, fecha de adquisición, procedencia, contenido disponible y metadatos; sus pruebas cubren identidad y procedencia. Add source detecta en servidor RSS/Atom, artículo o PDF y muestra un resumen antes de confirmar. La confirmación vuelve a comprobar tipo y huella y usa los adaptadores existentes: feed compartido, Story sin evaluación inventada o ingestión documental. Los PDF subidos se guardan de forma privada en R2 y se pueden reintentar. El límite de subida directa es 4 MB por la ruta multipart; los PDF públicos mayores siguen admitidos por URL (hasta 40 MB). Requiere las migraciones 0078 y 0079 y la configuración R2 existente.
