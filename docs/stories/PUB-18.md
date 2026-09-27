---
id: PUB-18
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p1, metrics]
---

# PUB-18 — Mostrar resultados básicos de Facebook e Instagram

**Estado:** [[status-todo]] · **Feature:** [Publicación en Meta](../features/instagram-publishing.md)

**Prioridad:** P1 · **Dependencias:** [PUB-06](PUB-06.md), [PUB-09](PUB-09.md), [PUB-15](PUB-15.md), [IG-05](IG-05.md), [IG-06](IG-06.md)

**Como** editor, **quiero** ver los resultados disponibles de cada publicación vinculada, **para** llevar a Facebook el seguimiento que ya tengo en Instagram.

## Criterios de aceptación

- Extender la consulta básica bajo demanda a los posts de la Página de Facebook. Reutilizar el seguimiento de Instagram existente; resolver permisos y capacidades de lectura de métricas por separado del permiso de publicar.
- Durante implementación, verificar en la versión de API elegida qué métricas ofrece cada tipo de post y con qué permisos. Mostrar solo campos soportados, su definición, periodo, unidad, fuente y fecha de consulta.
- Diferenciar cero real, pendiente, no disponible, sin permiso y error. Conservar el último dato válido con indicación de antigüedad; un fallo de métricas no cambia una publicación confirmada a fallida.
- Vincular cada observación a plataforma, cuenta, ID remoto, Topic, Story y paquete/revisión cuando se conozcan. Para publicaciones externas conservar «Versión no identificada» en lugar de atribuirlas al draft actual.
- Mostrar resultados en detalle de publicación e historial de Story. No sumar alcances de Facebook e Instagram como personas únicas ni comparar métricas con definiciones o periodos incompatibles.
- Respetar límites del proveedor, paginación y reintentos acotados; conservar correcciones de vínculo. Las métricas no reescriben puntuaciones editoriales históricas ni autorizan publicación.

## Alcance y validación

Paridad con la consulta básica de IG-05/IG-06. Capturas periódicas avanzadas, comparativas y optimización automática conservan su feature de rendimiento; no bloquean publicación ni programación.

Pruebas de dato cero, métrica ausente, permiso insuficiente, error temporal, post eliminado/inaccesible, vínculo corregido y actualización de ambos destinos sin mezclar unidades.
