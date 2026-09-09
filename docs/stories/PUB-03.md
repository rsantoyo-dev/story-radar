---
id: PUB-03
feature: FEAT-PUB-001
status: review
board: instagram-publishing.kanban.md
tags: [publishing, review, p0]
---

# PUB-03 — Congelar y preparar el paquete aprobado

**Estado:** [[status-review]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** congelar y preparar el paquete aprobado, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-01, PUB-02

**Criterios de aceptación**

- Antes del envío se conservan texto público exacto, orden de slides, IDs y versiones de cada asset, hashes, snapshot de guion, política y evidencia de aprobación. Un ID de draft mutable no basta para reproducir lo publicado.
- El MVP admite foto y carrusel de imágenes 4:5. Se validan dimensiones, peso, formato y cantidad de slides según la API desplegada. La conversión técnica a JPEG conserva encuadre, texto, atribuciones y originales; no se utiliza generación de imágenes.
- Meta obtiene únicamente los archivos de publicación mediante URLs de entrega accesibles para sus servidores y de vigencia suficiente. No se publica el bucket, referencias privadas, secretos ni claves de almacenamiento.
- El paquete derivado se identifica por hash y se muestra en la revisión de envío. No se modifica silenciosamente el caption, sus hashtags, el orden o la representación aprobada.
- Las transformaciones necesarias para publicar se incorporan a la vista revisada; si alteran el contenido más allá de la codificación técnica autorizada, el paquete vuelve a revisión.

## Implementación — 9 de septiembre de 2026

- Migración `0057`: `instagram_publication_packages` (caption exacto, hashtags, orden de slides, `draft_version`, `candidate_snapshot_hash`, `package_hash`, `script_snapshot`, `policy_snapshot`, `transforms`, identidad de destino, `status frozen|stale|consumed`, `expires_at`) + `instagram_delivery_files` (uno por slide: `token` único, `object_key` privado, `sha256` del JPEG y del original, dimensiones, `expires_at`). `unique(draft_id, candidate_snapshot_hash)` → congelar es idempotente.
- Dominio puro `instagram-publication-package.ts` (+ test): límites de Meta (1080×1350 exacto, ≤ 8 MiB `IG_PUBLISH_MAX_IMAGE_BYTES`, carrusel 2–10), `assertPublishableImage`, `resolvePublicationMediaType`, `computePackageHash` (sensible al orden y al contenido), `newDeliveryToken` (`base64url` de 24 bytes), `describeImageTransform` (un reescalado es *blocker*, no nota).
- Orquestación `freeze-publication-package.core.ts` (deps inyectables, + test): exige `candidate.state === "ready"` (incluye el chequeo vivo de PUB-02); si ya hay un paquete `frozen` con el mismo `candidate_snapshot_hash` lo devuelve sin re-subir; por slide lee el asset aprobado (el lector ya revalida aprobación/política/marca), confirma 1080×1350 estático, **re-encoda a JPEG q90 4:4:4 sin resize/rotación/metadatos**, valida `byte_size`, sube a R2 privado y persiste paquete + archivos en una transacción; si algo falla, borra los objetos subidos.
- Ruta `POST/GET/DELETE /api/radar/creative/drafts/[draftId]/publication-package` (autenticada). Errores nuevos en el ladder: `PublicationPackageValidationError` → 400, `PublicationPackageConflictError` → 409 (con `blockers`).
- **Ruta pública** `GET|HEAD /api/deliver/[token]` — sin `authorizeRadarCollector` (el token opaco es la capacidad; primera ruta de datos pública del repo). Resuelve el token → key privada de R2 → *streamea* el JPEG (`Content-Type: image/jpeg`, `Cache-Control: public, max-age=600`). Token desconocido → 404; paquete `stale` o archivo expirado → 410; `consumed` se sigue sirviendo mientras no expire (reintento de PUB-04). Nunca devuelve la key, secretos ni detalles del proveedor.
- Enlace de entrega = `${RADAR_APP_URL}/api/deliver/<token>`; el navegador recibe la URL pero nunca el `object_key` ni el token fuera de ella.
- UI: en el panel de candidato, cuando `state === "ready"`, botón **Freeze publication package**; se listan los paquetes con hash, caption exacto, slides (`v{version} · WxH · KB · sha256 · enlace de entrega`), bloque **Transforms applied** y **Discard package**. Un paquete cuya `draft_version` ya no coincide se marca `stale` con aviso. Congelar **no** publica ni programa.
- Staleness perezoso: `listPublicationPackages` marca `stale` por cambio de `draft_version`; el desfase de contenido fino se detecta al re-validar el candidato.

Validación: `npm test` (567, +11 de PUB-03), `npm run lint`, `npm run build`, `npx tsc --noEmit`, `npm run db:check`, `npm run uxdsl:build:creative`. Pendiente de prueba visual con un draft `ready` real y de comprobar que Meta descarga el enlace (necesita `RADAR_APP_URL` público — real en PUB-04).
