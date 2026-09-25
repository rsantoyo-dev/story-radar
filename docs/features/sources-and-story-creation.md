# Feature: Fuentes y creación de historias — acceso directo y menú propio

**ID:** FEAT-SRC-001  
**Estado:** SRC-01 a SRC-08 implementados.  
**Fecha:** 25 de septiembre de 2026  
**Producto:** Press Craftor  
**Tablero:** [sources-and-story-creation.kanban.md](sources-and-story-creation.kanban.md)

## Objetivo y experiencia esperada

Crear una historia y gestionar de dónde llegan las historias deben ser acciones de primer nivel, no pasos escondidos dentro de la configuración de un topic. El editor pulsa **New story** desde cualquier pantalla y, en el menú lateral, encuentra **Sources** con sus cuatro tipos: feeds RSS, investigación con IA, documentos e historias manuales.

Historia principal: **Como editor, quiero crear una historia o añadir una fuente en un par de clics, para alimentar el radar sin buscar el formulario dentro de la configuración del topic.**

## Punto de partida comprobado

- El menú lateral actual tiene Overview, Topics & sources, Editorial (Meta, Creative, Stories), Optimization y System settings. Todo lo relacionado con fuentes vive en `src/app/topic-configuration-panel.tsx`, un panel de más de mil líneas que mezcla alta de topics, feeds RSS, investigación con IA, documentos y "Owned content".
- Crear una historia manual exigía tres saltos: Topics & sources → elegir topic → bajar hasta "Owned content" → "Add custom story".
- El modelo de datos ya separa fuentes y topics: `rss_sources` pertenece al workspace y `topic_sources` dice qué topic usa cada feed, con prioridad y etiquetas propias; `knowledge_documents` también es del workspace con vínculo por topic; `ai_research_sources` es una configuración por topic; `owned_content_entries` es la fuente editorial detrás de cada historia manual y produce una Story normal (`stories`, `topic_stories`, `story_sources`).
- La API ya existe para todo: `POST /api/radar/topics/{topicId}/owned-content` crea una historia manual completa con `processingStatus: ready`; feeds, documentos e investigación con IA tienen sus rutas por topic.
- AGENTS.md define el producto como Sources → Stories con adaptadores por tipo de fuente; la interfaz debe hacer visible esa capa sin crear pipelines paralelos.
- Topic Overview (FEAT-OVW-001) ya planificó reagrupar el menú lateral en Workspace, Producción, Publicación y Configuración. Esta feature se alinea con esa agrupación para no rediseñar el menú dos veces.

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Acceso directo | Botón **New story** en la barra superior, junto al selector de topic, que abre un diálogo con el topic actual preseleccionado | Quita los tres saltos sin esperar a la reestructuración del menú |
| Qué crea | Una historia manual mediante la ruta de owned content existente; al guardar, se refrescan los indicadores y se muestra la bandeja del topic elegido | Reutiliza el contrato actual; el resultado es una Story normal, lista para evaluación y nunca publicada sola |
| Nombre | "Owned content" pasa a llamarse **Manual stories** en la interfaz; la tabla y la API no cambian | El término describe la acción del editor, no la propiedad del contenido |
| Menú | Nuevo grupo **Sources** con RSS feeds, AI research, Documents y Manual stories; **Topics** queda con alta de topics, líneas editoriales y qué fuentes usa cada topic | Refleja el modelo de datos: las fuentes son del workspace y los topics las consumen |
| Alta unificada | Un solo "Add source" que reconozca lo pegado (feed, artículo, archivo) se deja para el final | Toca el contrato compartido de ingestión y merece diseño propio |

### Menú lateral objetivo

```
Overview
Stories                       ← bandeja; New story también aquí en el estado vacío
Sources
  ├ RSS feeds                 ← lista del workspace, topics que usan cada feed, Add feed
  ├ AI research               ← una tarjeta por topic con su configuración
  ├ Documents                 ← subir o enlazar, asignar a topics
  └ Manual stories            ← lo que hoy es Owned content, con New story
Topics                        ← crear topic, líneas editoriales, fuentes que usa
Editorial / Creative / Instagram   (sin cambios)
Settings
```

## SRC-01 — implementado el 25 de septiembre de 2026

- `src/app/new-story-dialog.tsx`: diálogo modal accesible (foco inicial, Escape, `aria-modal`) con topic, tipo de contenido, título, idioma, región, fecha, URL opcional y contenido. Envía a `POST /api/radar/topics/{topicId}/owned-content`.
- `src/app/radar-dashboard.tsx`: botón **New story** en la barra superior, deshabilitado sin secreto o sin topics; al crear, refresca indicadores, cambia de topic si hace falta, muestra aviso de éxito y navega a Stories › Collected.
- Estilos en `radar-dashboard.module.uxdsl` reutilizando el fondo y la cabecera del visor de contenido y el patrón `.field`; solo se añaden la maquetación del formulario y el botón. Compilado con `uxdsl build`.
- El formulario de "Owned content" se retiró en SRC-06 al quedar disponible la vista Manual stories.

## Entregas y límites

| Fase | Resultado | Historias |
|---|---|---|
| 1: acceso directo | Botón global New story y diálogo | SRC-01 |
| 2: menú Sources | Grupo Sources con cuatro vistas y Topics simplificado | SRC-02 a SRC-07 |
| 3: alta unificada | Un solo Add source con detección de tipo | SRC-08 |

Fuera de alcance: nuevos tipos de fuente, cambios en la evaluación o en la deduplicación, editor enriquecido para historias manuales, y permisos por usuario (llegan con FEAT-AUTH-001).

## Criterios de entrega transversales

- Ninguna vista de Sources crea pipelines paralelos: cada tipo sigue produciendo Stories por su adaptador actual.
- Las fuentes del workspace muestran a qué topics están vinculadas; desvincular de un topic nunca borra el registro compartido.
- UXDSL obligatorio: paleta dinámica, densidades, breakpoints y primitivas existentes; sin colores ni escalas nuevas.
- Accesibilidad: diálogos con foco gestionado y cierre por teclado; listas navegables; estados vacío, cargando y error.
- `npm run lint`, `npm run build` y `npm test` del dominio afectado en cada historia.

## Historias de implementación

- [SRC-01 — Botón global New story con diálogo](../stories/SRC-01.md) · P0 · hecho.
- [SRC-02 — Grupo Sources en el menú lateral y anclas](../stories/SRC-02.md) · P0 · hecho.
- [SRC-03 — Vista de feeds RSS del workspace](../stories/SRC-03.md) · P0 · hecho.
- [SRC-04 — Vista de investigación con IA por topic](../stories/SRC-04.md) · P1 · hecho.
- [SRC-05 — Vista de documentos](../stories/SRC-05.md) · P1 · hecho.
- [SRC-06 — Vista de historias manuales](../stories/SRC-06.md) · P0 · hecho.
- [SRC-07 — Topics simplificado con fuentes vinculadas](../stories/SRC-07.md) · P1 · hecho.
- [SRC-08 — Add source unificado con detección de tipo](../stories/SRC-08.md) · P2 · hecho.

## Estado de implementación

SRC-02 a SRC-07 añadieron el catálogo del workspace, sus vínculos por topic y las vistas Sources/Topics. SRC-08 añadió detección y confirmación antes de persistir. La subida directa de PDF admite hasta 4 MB; para archivos mayores se usa una URL pública (hasta 40 MB). Los PDF subidos requieren R2 y las migraciones 0078/0079.
