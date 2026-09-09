# Feature: Hooks claros con selección editorial verificable

**ID:** FEAT-HOOK-001  
**Estado:** Implementado; evaluación editorial con noticias nuevas pendiente.  
**Relación:** [Instagram performance](instagram-performance.md), [evidencia editorial](editorial-evidence-guardrails.md).

Una portada puede ser correcta y aun así limitarse a resumir un anuncio. Esta mejora selecciona una apertura con una utilidad, distinción, consecuencia o sorpresa concreta sustentada por los hechos, y comprueba que el carrusel responde a su promesa. No promete hooks universalmente «10/10» ni resultados de engagement.

## Historias y tareas completadas

### HOOK-01 — Unificar el criterio de portada

**Como** editor, **quiero** una introducción limpia y comprensible, **para** identificar inmediatamente el tema y el motivo para continuar.

- [x] Compartir la política entre brief, generación, crítica y reescritura.
- [x] Objetivo de 4–7 palabras, normalmente hasta 9; hasta 24 palabras de contexto. Eliminar la instrucción contradictoria que usaba 12 palabras.
- [x] Mantener claridad, nombres, atribución, ámbito y calificadores por encima del límite orientativo. No truncar para cumplirlo ni aplicar el conteo como certificación a idiomas sin separación por espacios.
- [x] Priorizar acciones concretas sobre verbos genéricos y contrastes solo cuando ambas partes estén respaldadas. No introducir autonomía, disponibilidad futura, riesgo o impacto personal inexistentes.

### HOOK-02 — Comparar tres opciones y conservar la decisión

**Como** editor, **quiero** ver qué alternativas se evaluaron y por qué se eligió una, **para** revisar el enfoque además de una puntuación.

- [x] Devolver tres pares breves de titular/contexto en la llamada editorial existente, sin una llamada nueva dedicada a hooks.
- [x] Registrar los IDs de hechos, la pregunta del lector, la unidad que aporta la respuesta y un motivo breve por candidato.
- [x] Validar alternativas distintas, IDs dentro de los hechos permitidos para la portada y una respuesta en una unidad existente. El ganador debe coincidir exactamente con el titular, contexto y hechos devueltos.
- [x] Persistir `qualityReview.hookSelection` en el JSON existente del draft, sin migración ni sustitución de versiones históricas.

### HOOK-03 — Evaluar cinco criterios y corregir dentro del presupuesto existente

**Como** responsable editorial, **quiero** criterios explícitos, **para** que una puntuación optimista no oculte una apertura débil.

- [x] Checklist: comprensión inmediata, tensión/sorpresa sustentada, consecuencia o utilidad concreta, lenguaje humano y curiosidad con respuesta.
- [x] Exigir claridad y respaldo factual; al menos 4/5 criterios para aceptación automática. No exigir tensión artificial a una noticia útil y directa.
- [x] Convertir un checklist insuficiente en feedback de reparación y calibrar las puntuaciones mediante los controles existentes; 99/100 no supera una claridad fallida.
- [x] Aplicar el mismo contrato al editor OpenAI y a la auditoría alternativa. Mantener el límite de modelos/reintentos existente; si la corrección no basta, revisión humana con explicación.
- [x] Conservar verificaciones de hechos independientes. `supported=true` y el checklist son evaluaciones editoriales del modelo, no pruebas externas de veracidad ni predicciones de retención.

### HOOK-04 — Revisar opciones sin confundirlas con el texto aprobado

**Como** editor, **quiero** inspeccionar las opciones en el draft, **para** evaluar el enfoque elegido sin incorporarlas por error al post.

- [x] Mostrar «Hook comparison» dentro de la revisión automática: opción elegida, alternativas, razones, checklist, hechos y unidad de respuesta.
- [x] Mantener estos metadatos fuera del guion exportado y de las imágenes. La UI no aplica automáticamente una alternativa.
- [x] Marcar la comparación como anterior cuando el draft tiene cambios sin revisar. Retirar la evaluación si una reparación factual posterior modifica el guion.
- [x] Distinguir un objetivo editorial incumplido de la indisponibilidad del crítico; ambos requieren revisión, pero tienen causas distintas.

### HOOK-05 — Verificar regresiones

- [x] Probar rechazo de candidatos duplicados, selección distinta de la portada, hechos no planificados y unidades de respuesta inexistentes.
- [x] Probar que una historia útil puede pasar sin tensión inventada, pero no sin claridad ni evidencia.
- [x] Probar que el checklist insuficiente activa el fallback ya existente y conserva la comparación corregida; un fallo repetido no queda aceptado.
- [x] Probar el mismo contrato en la auditoría alternativa y la invalidación tras la reparación final del guion.
- [ ] Evaluar una muestra nueva de hooks con el editor y, más adelante, métricas reales de lectura/retención. El historial anterior no mide automáticamente el resultado de estas reglas nuevas.

## Operación

Versiones de prompt: brief v30, meme v25 y carrusel v41. Las generaciones nuevas utilizan la política actual; los drafts existentes no se reescriben en segundo plano. La comparación aparece cuando una revisión nueva devuelve el contrato válido. No se han modificado imágenes, mapas ni aprobaciones.

La respuesta OpenAI conserva sus límites existentes de salida. La auditoría alternativa reserva 1.024 tokens adicionales para los tres candidatos (2.560 en meme y 4.096 en carrusel); no duplica el artículo ni el draft en estos metadatos y no añade una llamada fija por publicación. Los límites de disponibilidad/reparación continúan siendo finitos.

**Validación de implementación:** 533 pruebas pasan, incluidas cinco nuevas de selección/checklist y la regresión del flujo Gemini → editor → reparación final. Lint y build de producción (con TypeScript) pasan. Las pruebas de proveedores utilizan respuestas simuladas: no se ejecutó una evaluación editorial con APIs reales ni se modificaron los posts existentes.
