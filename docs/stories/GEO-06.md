---
id: GEO-06
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.kanban.md
tags: [geo, done, p0]
---

# GEO-06

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

**Depende de:** [[GEO-01]] · [[GEO-05]]

<!-- body -->
**GEO-06 — Componer assets con fotografías reales**

**Como** editor, **quiero** crear un post o carrusel usando originales elegibles, **para** conservar la apariencia real del lugar y la identidad de mi marca.

**Prioridad:** P0 · **Dependencias:** GEO-01 y GEO-05 · **Entrega:** Preparación automática

**Criterios de aceptación**

- Fotografía obligatoria utiliza composición determinista sobre el archivo original y no solicita text-to-image, image-to-image, inpainting ni expansión generativa del lugar.
- Permite encuadre, escala proporcional, zonas de texto, contraste de legibilidad y marca; no elimina ni añade edificios, personas, monumentos o elementos del lugar.
- Se respeta 4:5 a 1080×1350. Cuando el original no encaja, se ofrece recorte revisable o márgenes de diseño, sin inventar contenido fuera del encuadre.
- Un original con resolución insuficiente se señala; se permite sustituirlo o usar otro diseño sin reconstrucción generativa encubierta.
- La vista previa muestra atribución y rótulos de archivo/ilustración cuando correspondan, y estos sobreviven a la exportación.
- Sin foto elegible, se intenta el mapa determinista si existe localización verificada y es adecuado para la noticia; en otro caso se prepara tipografía. La revisión final explica “Falta fotografía verificable”. No se genera un lugar sustituto ni se solicita intervención intermedia.
- Cada asset guarda snapshot del lugar, original, recorte, política, atribución y evidencias de elegibilidad utilizadas, reutilizando el modelo de versiones existente.
- El guion y los assets se preparan sin aprobación humana previa. Una única revisión final aprueba el conjunto exacto; la biblioteca y la elegibilidad no aprueban automáticamente la publicación.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-06

**Implementación:** recorrido documental conectado; revisar límites de proveedores, biblioteca y validación real en la sección «Implementación y operación» del documento. Aceptación hiperlocal pendiente.
