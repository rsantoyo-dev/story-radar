# Ángulos editoriales y hooks de adquisición — FEAT-ANGLE-001

## Backlog

## Por hacer

### ANGLE-01 — Definir el contrato de ángulos

  - priority: high
  - tags: [editorial, hooks, taxonomy, migration, p0]
  - note: no reutilizar GeneratedCreativeBrief.angle; editorialAngle se persiste como JSONB nullable y el vocabulario versionado vive en topic_acquisition_lenses, separado de isDefault

### ANGLE-02 — Clasificar la noticia a partir de evidencia

  - priority: high
  - tags: [editorial, hooks, p0]
  - depends-on: [ANGLE-01]

### ANGLE-03 — Mejorar la generación y selección del hook

  - priority: high
  - tags: [editorial, hooks, p0]
  - depends-on: [ANGLE-02]
  - note: la validación de tres candidatos/checks/payoff ya existe en creative-hook-policy.ts; esta tarea se centra en steering de prompt y contrato del ángulo

### ANGLE-04 — Asignar ángulos provisionales en la recomendación diaria

  - priority: high
  - tags: [editorial, planner, p0]
  - depends-on: [ANGLE-01, ANGLE-02]
  - note: el planner corre antes del brief; asigna un provisional dentro de su llamada existente, usa una taxonomyVersion a nivel de plan y requiere PLANNER_PROMPT_VERSION daily-planner-v3

### ANGLE-05 — Mostrar la decisión editorial en el draft

  - priority: high
  - tags: [editorial, hooks, ui]
  - depends-on: [ANGLE-02, ANGLE-03, ANGLE-04, ANGLE-07]

### ANGLE-07 — Autoría y publicación de taxonomías

  - priority: high
  - tags: [editorial, taxonomy, api, ui, migration, p0]
  - depends-on: [ANGLE-01]
  - note: endpoint + UI mínima; publica snapshots append-only, mantiene line_id nullable reservado y no crea perfiles editoriales ni altera isDefault

### ANGLE-06 — Verificación automatizada y QA editorial

  - priority: high
  - tags: [editorial, hooks, tests, p0]
  - depends-on: [ANGLE-01, ANGLE-02, ANGLE-03, ANGLE-04, ANGLE-05, ANGLE-07]
  - note: repetir usa ventana 10; distribución usa hasta 30 publicaciones con lente conocida y no aplica targets por debajo de 20 casos

## En progreso

## En revisión / QA

## Hecho
