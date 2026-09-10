# Publicación desde el SaaS — FEAT-PUB-001

> **Prueba local exitosa con ngrok (9 de septiembre de 2026):** el usuario confirmó conexión y publicación funcionando. QA completa y despliegue supervisado siguen pendientes. [Evidencia y alcance](../stories/PUB-08.md#prueba-real-confirmada-con-ngrok--9-de-septiembre-de-2026) · [Guía localhost](instagram-publishing-worker.md#ejecutar-en-localhost-con-ngrok).

## Backlog

### PUB-09 — Conectar una página de Facebook

  - priority: high
  - tags: [publishing, p0]

### PUB-10 — Publicar en Instagram, Facebook o ambos

  - priority: high
  - tags: [publishing, p0]

### PUB-11 — Desplegar y supervisar la publicación permanente

  - priority: high
  - tags: [publishing, p0]

### PUB-12 — Unificar seguimiento de Instagram y Facebook

  - priority: medium
  - tags: [publishing, p1]

## Por hacer

### PUB-05 — Programar y cancelar una publicación

  - priority: medium
  - tags: [publishing, p1]
  - nota: ampliada con calendario y destinos Instagram/Facebook; requiere despliegue PUB-11 y PUB-10 para ambos destinos.

### PUB-06 — Registrar y vincular automáticamente la publicación

  - priority: high
  - tags: [publishing, p0]
  - nota: registro, recuperación, dedup y preservación de cambios manuales probados localmente; falta revisar el resumen compatible y la trazabilidad visual end-to-end.


## En progreso

## En revisión / QA

### PUB-08 — Validar publicación y trazabilidad de extremo a extremo

  - priority: high
  - tags: [publishing, review, p0]
  - nota: conexión y publicación confirmadas por el usuario con ngrok; matriz completa y despliegue pendientes.

### PUB-01 — Identificar publicaciones listas para publicar

  - priority: high
  - tags: [publishing, p0]

### PUB-02 — Verificar la capacidad de publicar de la cuenta

  - priority: high
  - tags: [publishing, p0]

### PUB-03 — Congelar y preparar el paquete aprobado

  - priority: high
  - tags: [publishing, p0]

### PUB-04 — Publicar ahora desde el SaaS

  - priority: high
  - tags: [publishing, review, p0]

### PUB-07 — Evitar duplicados y reconciliar resultados inciertos

  - priority: high
  - tags: [publishing, review, p0]
  - nota: reintentos explícitos, lease, límites, recuperación local y estados inciertos corregidos; worker independiente preparado, pendiente de validación desplegada.

## Hecho
