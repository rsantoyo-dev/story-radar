# Instagram — FEAT-IG-001

## Backlog

### IG-08 — Comparar rendimiento de publicaciones equivalentes

  - tags: [ig]
  - note: post-MVP — depende de las capturas temporales de IG-07.

### IG-09 — Conectar resultados con decisiones creativas

  - tags: [ig]
  - note: post-MVP — análisis exploratorio; depende de IG-08 y de volumen de posts con versión identificada.

## Por hacer

## En progreso

## En revisión / QA

### IG-07 — Sincronización automática (histórico de métricas)

  - tags: [ig]
  - note: 2026-10-06 — cada lectura de métricas se guarda en `instagram_media_metric_snapshots` (migración 0089) con su edad real; pasada horaria `/api/internal/instagram-metrics/capture` (GitHub Actions, `INSTAGRAM_METRICS_WORKER_SECRET`): cada 6 h hasta 72 h, diaria hasta 7 días, cada 3 días hasta 30. Funciona también con cuentas conectadas por Página de Facebook. Pendiente: secreto y URL en Vercel/GitHub, y la lectura por edad (24 h, 72 h, 7 d) en la interfaz (IG-08).

### IG-06 — Ver resultados desde la historia editorial

  - tags: [ig]

### IG-03 — Explorar la galería de Instagram

  - tags: [ig]

### IG-02 — Importar publicaciones de la cuenta conectada

  - tags: [ig]

## Hecho

### IG-05 — Consultar métricas actuales por publicación

  - tags: [ig]

### IG-04 — Vincular un post con su historia y versión creativa

  - tags: [ig]

### BASE-01 — Conexión de Instagram por tema

  - tags: [ig, infra]

### BASE-02 — Cliente Meta

  - tags: [ig, infra]

### BASE-03 — OAuth con permisos básicos y de publicación

  - tags: [ig, infra]

### BASE-04 — Modelo base `story_social_publications`

  - tags: [ig, infra]

### IG-01 — Habilitar y verificar acceso a insights

  - tags: [ig]
