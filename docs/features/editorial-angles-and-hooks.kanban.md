# Ángulos editoriales y hooks de adquisición — FEAT-ANGLE-001

## Backlog

## Por hacer

## En progreso

### ANGLE-06 — Verificación automatizada y QA editorial

  - priority: high
  - tags: [editorial, hooks, tests, p0]
  - depends-on: [ANGLE-01, ANGLE-02, ANGLE-03, ANGLE-04, ANGLE-05, ANGLE-07]
  - note: hechas las unitarias de taxonomía, presentación (lente retirada/desconocida),
    provisional del planner (clave inválida, versión discrepante, sin vocabulario) y
    ventanas. Falta la muestra manual multi-topic (≥2 historias por vocabulario) y las
    pruebas de integración con respuestas de proveedor simuladas.

## En revisión / QA

### ANGLE-01 — Definir el contrato de ángulos

  - priority: high
  - tags: [editorial, hooks, taxonomy, migration, p0]
  - note: contrato de lentes, `topic_acquisition_lenses` (append-only, `line_id` nullable),
    `story_creative_briefs.editorial_angle` nullable y defaults genéricos. Migración 0072
    aplicada; seis topics activos sembrados en v1; 224 briefs históricos intactos en NULL.

### ANGLE-02 — Clasificar la noticia a partir de evidencia

  - priority: high
  - tags: [editorial, hooks, p0]
  - depends-on: [ANGLE-01]
  - note: prompt, schema, parser y persistencia; `briefPromptVersion` en `creative-brief-v33`.
    El campo textual `angle` se conserva intacto para el fact guard. Falta validarlo con
    briefs reales.

### ANGLE-03 — Mejorar la generación y selección del hook

  - priority: high
  - tags: [editorial, hooks, p0]
  - depends-on: [ANGLE-02]
  - note: steering por el `hookBias` del lente elegido, expresado por tratamiento
    (capability/stake/contrast) y nunca por clave, así que ningún módulo compartido conoce
    el vocabulario de un topic. La validación de tres candidatos, checks y payoff ya existía.

### ANGLE-04 — Asignar ángulos provisionales en la recomendación diaria

  - priority: high
  - tags: [editorial, planner, p0]
  - depends-on: [ANGLE-01, ANGLE-02]
  - note: taxonomía y distribución reciente en el contexto seguro, `angle` en `PlannerChoice`,
    `taxonomyVersion` a nivel de plan, `daily-planner-v3`. Distribución sobre 30 publicaciones
    y `targetsApply` desactiva las cuotas por debajo de 20 clasificadas.

### ANGLE-05 — Mostrar la decisión editorial en el draft

  - priority: high
  - tags: [editorial, hooks, ui]
  - depends-on: [ANGLE-02, ANGLE-03, ANGLE-04, ANGLE-07]
  - note: bloque de ángulo en el workspace con razón, stake, promesa y alternativa; una lente
    retirada o desconocida se marca como histórica y nunca se repara sola. El ángulo provisional
    aparece en el panel del planner. La selección de hooks ya se mostraba.

### ANGLE-07 — Autoría y publicación de taxonomías

  - priority: high
  - tags: [editorial, taxonomy, api, ui, migration, p0]
  - depends-on: [ANGLE-01]
  - note: API GET/PUT con control optimista por `expectedTaxonomyVersion` y panel en el
    dashboard para editar label, definición, `hookBias`, `targetShare`, enabled y fallback.
    Publica snapshots append-only sin tocar `topic_editorial_profiles` ni `isDefault`.

## Hecho
