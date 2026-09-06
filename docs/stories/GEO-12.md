---
id: GEO-12
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.board.md
tags: [geo, done, p0]
---

# GEO-12

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-02]] · [[GEO-06]] · [[GEO-08]] · [[GEO-09]] · [[GEO-11]]

<!-- body -->
**GEO-12 — Orquestar preparación automática y revisión final única**

**Como** editor, **quiero** recibir una publicación terminada con su evidencia sin intervenir durante la preparación, **para** revisar una sola vez al final.

**Prioridad:** P0 · **Dependencias:** GEO-02 a GEO-06, GEO-08, GEO-09 y GEO-11 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Una ejecución recorre extracción, resolución, biblioteca/búsqueda, elegibilidad, guion y composición sin exigir aprobación intermedia. La configuración previa de la marca no se solicita de nuevo por publicación.
- El orquestador utiliza estados de preparación propios. No llama automáticamente a las acciones de aprobación humana de guion, fotografía o asset ni falsifica actor o `approvedAt` para atravesar las protecciones actuales.
- Orden de salida: fotografía elegible; mapa con coordenadas verificadas si es pertinente; tipografía con hechos sustentados. Si ninguna pieza segura es posible, resultado bloqueado en la bandeja final. Ninguna rama genera artificialmente el lugar ni relaja la política documental.
- Cada rama registra sus razones, procedencia y material usado. Biblioteca y caché se reutilizan por tema/lugar, con nueva comprobación de pertinencia temporal y condiciones de uso para cada noticia.
- Las tareas del servidor tienen límites de coste, tiempo y reintentos; al agotarlos entregan la alternativa o bloqueo final, sin quedar esperando una respuesta humana intermedia.
- La única pantalla final incluye pieza, guion, original/mapa, identidad, evidencia, atribución, fecha/contexto y restricciones. Permite aprobar la versión completa, rechazarla o corregir y relanzar. Una aprobación anterior nunca aprueba automáticamente una nueva versión.
- Artículo, ámbito, política, lugar y material quedan versionados. Los resultados asíncronos obsoletos no reemplazan decisiones nuevas ni llegan como aprobados a publicación.
- Publicación y exportación como material listo requieren la aprobación humana final vigente; las previsualizaciones anteriores permanecen como borradores. La autorización de esta historia es preparar automáticamente, no publicar automáticamente.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-12

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.
