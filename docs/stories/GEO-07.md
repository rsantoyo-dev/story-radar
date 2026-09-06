---
id: GEO-07
feature: FEAT-GEO-001
status: review
board: real-place-visual-fidelity.board.md
tags: [geo, review, p0]
---

# GEO-07

**Estado:** [[status-review]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-12]]

<!-- body -->
**GEO-07 — Validar el flujo hiperlocal y sus regresiones**

**Como** responsable de calidad, **quiero** comprobar la política con casos reales de la marca, **para** lanzar el MVP sin representaciones engañosas.

**Prioridad:** P0 · **Dependencias:** GEO-12 · **Entrega:** Validación de entrega

**Criterios de aceptación**

- El recorrido automático completo no exige clics, confirmaciones ni aprobaciones antes de la bandeja final, incluidos errores, ambigüedades y falta de configuración.
- Fixtures cubren plaza sin nombre, homónimos, nombre francés, varios lugares, lugar no encontrado, fotografía de archivo y permiso desconocido.
- Se verifica que fotografía obligatoria nunca llama al generador, incluso ante error, timeout o falta de material.
- Pruebas cubren cambio de política, sustitución de foto, respuesta de Luna desactualizada y edición concurrente: ningún resultado viejo aprueba una versión nueva.
- Se comprueba trazabilidad, aislamiento por tema, atribución exportada y conservación de assets históricos.
- Se evalúa Luna sobre un conjunto revisado por el editor local, registrando extracciones correctas, ambigüedades y selecciones erróneas; no basta un score autodeclarado.
- El editor valida visualmente una publicación de la plaza de salut.st.jean con material confirmado, además de casos sin foto que terminan en mapa adecuado, tipografía o bloqueo final justificado. Esta validación del producto no introduce revisiones intermedias por publicación.
- Pasan pruebas relevantes, lint, build y db:check cuando haya migraciones. Cualquier bloqueo del entorno queda documentado.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-07

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.

Revisión de búsqueda web: Luna consulta texto e imágenes; URLs reales de herramienta y enlaces de búsqueda Google Maps aparecen en la revisión final sin aprobaciones intermedias. Prueba real aislada: 12 fuentes y dos fotos candidatas. Esto no habilita ingestión automática de nuevas fuentes ni Google Places API; la composición conserva sus verificaciones existentes. Pruebas: 351; validación hiperlocal final pendiente.

**Anotación de revisión (2026-09-06):** GEO-01..06, 08, 09, 11 y 12 movidas a Hecho tras una ejecución real end-to-end contra Luna + web search, Wikidata y Commons con salida correcta (reportada por el editor). GEO-07 queda pendiente y NO es bloqueante para las anteriores: exige (1) validación visual del piloto salut.st.jean con material confirmado, documentada; (2) conjunto de evaluación de Luna revisado por el editor local (aciertos/ambigüedades/errores), no un score autodeclarado; (3) matriz de fixtures ejecutada: plaza sin nombre, homónimos, nombre francés, varios lugares, lugar no encontrado, foto de archivo, permiso desconocido, noticia de cambio de estado que cae en tipografía, cambio de política y edición concurrente; (4) npm run build: sigue roto por el problema preexistente de Turbopack / :root en CSS Modules generados, ajeno a GEO — resolver o aceptar como bloqueo de entorno documentado. Estado actual: 351 tests, tsc, lint y db:check en verde; adaptadores de proveedores probados con mocks + una corrida real del editor.
