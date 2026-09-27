# Publicación en Meta — FEAT-PUB-001

> **Alcance actualizado el 26 de septiembre de 2026:** conexión Meta, preview tras el draft, Facebook/Instagram, programación, vínculo y marca de Story publicada, historial y automatización. [Feature y orden de entrega](instagram-publishing.md) · [Matriz de QA](../stories/PUB-08.md#matriz-de-qa-meta--ampliación-del-26-de-septiembre-de-2026).
>
> La prueba local de Instagram con ngrok del 9 de septiembre se conserva como [evidencia parcial](../stories/PUB-08.md#prueba-real-confirmada-con-ngrok--9-de-septiembre-de-2026). Las ampliaciones nuevas no están implementadas. AUTH-04/05/06 son requisito para habilitar conexiones y publicaciones a clientes independientes.

## Backlog

### PUB-17 — Habilitar publicación autónoma con autorización y límites explícitos

  - priority: medium
  - tags: [publishing, backlog, p1, automation]
  - nota: opcional después de PUB-16; política por Topic/workflow, gates, cuotas, simulación y pausa; deshabilitada por defecto.

## Por hacer

### PUB-09 — Conectar Meta y elegir Facebook e Instagram

  - priority: high
  - tags: [publishing, todo, p0, meta]
  - nota: PUB-13 y AUTH-04/05/06; conserva Instagram directo y verifica capacidades por destino.

### PUB-14 — Mostrar el preview de publicación al terminar el draft

  - priority: high
  - tags: [publishing, todo, p0, preview]
  - nota: preview exacto por plataforma, assets pendientes visibles y aprobación/envío desde una pantalla.

### PUB-10 — Publicar en Instagram, Facebook o ambos

  - priority: high
  - tags: [publishing, todo, p0, meta]
  - nota: entregas y paquetes independientes; éxito parcial y recuperación sin duplicar.

### PUB-06 — Registrar y vincular automáticamente la publicación

  - priority: high
  - tags: [publishing, todo, p0]
  - nota: base Instagram parcial; ampliar a ambos destinos, reparar proyecciones y marcar Story publicada por Topic automáticamente.

### PUB-15 — Sincronizar publicaciones de Meta y vincularlas con Stories

  - priority: high
  - tags: [publishing, todo, p0, linking]
  - nota: galería de Facebook, históricos externos, vínculo manual y preservación de correcciones.

### PUB-11 — Desplegar y supervisar la publicación permanente

  - priority: high
  - tags: [publishing, todo, p0]
  - nota: verificar despliegue actual, cadencia, recuperación y supervisión antes de habilitar horarios.

### PUB-05 — Programar y cancelar una publicación

  - priority: high
  - tags: [publishing, todo, p0]
  - nota: calendario propio, UTC/zona IANA, reprogramación, adelanto y cancelación por destino; requiere PUB-10/PUB-11.

### PUB-12 — Unificar seguimiento de Instagram y Facebook

  - priority: high
  - tags: [publishing, todo, p0]
  - nota: historial por Story/Topic, auditoría, estados y acciones; integra calendario al habilitar PUB-05.

### PUB-16 — Automatizar la preparación y continuar después de la aprobación

  - priority: medium
  - tags: [publishing, todo, p1, automation]
  - nota: genera preview automáticamente; aprobación final autoriza envío o programación sin otros clics.

### PUB-18 — Mostrar resultados básicos de Facebook e Instagram

  - priority: medium
  - tags: [publishing, todo, p1, metrics]
  - nota: paridad de seguimiento básico; capacidades por API sin duplicar la feature de analítica avanzada.

## En progreso

### PUB-13 — Compartir el contrato de publicación entre Facebook e Instagram

  - priority: high
  - tags: [publishing, in-progress, p0, meta]
  - nota: esquema y migración aditivos, sincronización de jobs Instagram y confirmaciones remotas implementados; faltan adaptadores Facebook y cierre de QA por destino.

## En revisión / QA

### PUB-08 — Validar publicación y trazabilidad de extremo a extremo

  - priority: high
  - tags: [publishing, review, p0]
  - nota: conserva evidencia Instagram y añade matriz Meta; QA de ampliaciones pendiente por fase.

### PUB-01 — Identificar publicaciones listas para publicar

  - priority: high
  - tags: [publishing, review, p0]

### PUB-02 — Verificar la capacidad de publicar de la cuenta

  - priority: high
  - tags: [publishing, review, p0]

### PUB-03 — Congelar y preparar el paquete aprobado

  - priority: high
  - tags: [publishing, review, p0]

### PUB-04 — Publicar ahora desde el SaaS

  - priority: high
  - tags: [publishing, review, p0]
  - nota: base Instagram; Facebook y selección conjunta en PUB-10.

### PUB-07 — Evitar duplicados y reconciliar resultados inciertos

  - priority: high
  - tags: [publishing, review, p0]
  - nota: base Instagram con recuperación y leases; controles compartidos en PUB-13/PUB-10.

## Hecho
