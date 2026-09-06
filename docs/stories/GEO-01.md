---
id: GEO-01
feature: FEAT-GEO-001
status: done
board: real-place-visual-fidelity.board.md
tags: [geo, done, p0]
---

# GEO-01

**Estado:** [[status-done]] · **Feature:** [[real-place-visual-fidelity]] (FEAT-GEO-001)

<!-- body -->
**GEO-01 — Configurar fidelidad visual y ámbito geográfico**

**Como** editor de una marca local, **quiero** definir cómo se representan lugares, **para** evitar imágenes engañosas por defecto.

**Prioridad:** P0 · **Dependencias:** ninguna · **Entrega:** Preparación automática

**Criterios de aceptación**

- El perfil permite elegir los tres modos y registrar municipio, región y país; se puede seleccionar una ubicación validada posteriormente.
- Los perfiles existentes conservan su comportamiento hasta que el editor cambie la política.
- Cada publicación muestra la política heredada y permite un override explícito con motivo. Cambiar de fotografía obligatoria a ilustración nunca es un fallback silencioso.
- Cambiar la política invalida la aprobación de los assets afectados y crea una nueva versión sin modificar el histórico.
- La UI usa UXDSL, la paleta de la marca y los breakpoints del proyecto.

Referencia: docs/features/real-place-visual-fidelity.md · GEO-01
