---
id: PUB-03
feature: FEAT-PUB-001
status: todo
board: instagram-publishing.kanban.md
tags: [publishing, todo, p0]
---

# PUB-03 — Congelar y preparar el paquete aprobado

**Estado:** [[status-todo]] · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** congelar y preparar el paquete aprobado, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** PUB-01, PUB-02

**Criterios de aceptación**

- Antes del envío se conservan texto público exacto, orden de slides, IDs y versiones de cada asset, hashes, snapshot de guion, política y evidencia de aprobación. Un ID de draft mutable no basta para reproducir lo publicado.
- El MVP admite foto y carrusel de imágenes 4:5. Se validan dimensiones, peso, formato y cantidad de slides según la API desplegada. La conversión técnica a JPEG conserva encuadre, texto, atribuciones y originales; no se utiliza generación de imágenes.
- Meta obtiene únicamente los archivos de publicación mediante URLs de entrega accesibles para sus servidores y de vigencia suficiente. No se publica el bucket, referencias privadas, secretos ni claves de almacenamiento.
- El paquete derivado se identifica por hash y se muestra en la revisión de envío. No se modifica silenciosamente el caption, sus hashtags, el orden o la representación aprobada.
- Las transformaciones necesarias para publicar se incorporan a la vista revisada; si alteran el contenido más allá de la codificación técnica autorizada, el paquete vuelve a revisión.
