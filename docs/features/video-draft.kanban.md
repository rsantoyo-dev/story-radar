# Video Draft — FEAT-VID-001

**Estado:** Planificado. Fase 1: video aprobado y descargable. Publicación de Reels fuera de fase 1.

[Feature y decisiones de arquitectura](video-draft.md)

## Backlog

### VID-16 — Publicar el video aprobado como Reel — fase posterior

  - priority: medium
  - tags: [video, p1, fase-posterior]

## Por hacer

### VID-01 — Validar Jo y Sofi con voz, lip-sync y transparencia

  - priority: high
  - tags: [video, p0]
  - dependencias: ninguna

### VID-02 — Definir contratos versionados y reglas de invalidación

  - priority: high
  - tags: [video, p0]
  - dependencias: ninguna

### VID-03 — Crear Video Draft y Video Director desde Script Draft

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-02

### VID-04 — Editar y aprobar el VideoPlan

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-03

### VID-05 — Persistir Video Jobs y orquestar etapas recuperables

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-02, VID-04

### VID-06 — Resolver fondos, imágenes y gráficos del plan

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-02, VID-05

### VID-07 — Generar una narración maestra con ElevenLabs

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-02, VID-05

### VID-08 — Compilar la timeline a partir del audio real

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-02, VID-07

### VID-09 — Generar clips NARRATOR con Sync-3

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-01, VID-05, VID-08

### VID-10 — Obtener alpha del personaje con VEED

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-01, VID-09

### VID-11 — Construir y validar ResolvedVideo listo para render

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-06, VID-08, VID-10

### VID-12 — Implementar el renderer Remotion y sus plantillas

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-11

### VID-13 — Revisar previews y regenerar solo dependencias afectadas

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-04, VID-05, VID-12

### VID-14 — Aprobar, exportar y conservar el video final en R2

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-13

### VID-15 — Validar la fase 1 de extremo a extremo

  - priority: high
  - tags: [video, p0]
  - dependencias: VID-14

## En progreso

## En revisión / QA

## Hecho
