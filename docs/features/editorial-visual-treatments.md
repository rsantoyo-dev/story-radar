# Feature: Tratamientos visuales editoriales para la grilla

**ID:** FEAT-VISUAL-001  
**Estado:** Planificado — P0  
**Tablero:** [editorial-visual-treatments.kanban.md](editorial-visual-treatments.kanban.md)  
**Relación:** [Ángulos editoriales y hooks de adquisición](editorial-angles-and-hooks.md), [Brand visual references](brand-visual-references.md), [Creative image editing](creative-image-editing.md), [Instagram performance](instagram-performance.md)

## Problema

La marca es consistente, pero demasiados posts usan la misma combinación de fondo oscuro, megaheadline, acentos cyan/lime y render tecnológico. La consistencia empieza a parecer repetición mecánica y reduce la variedad editorial de la grilla.

La solución debe variar la composición y el medio visual sin romper identidad, legibilidad móvil, proporción 4:5, permisos de imágenes ni el historial de drafts y assets.

## Resultado esperado

Cada publicación nueva recibe un tratamiento visual principal:

- `hero-graphic` — portada gráfica de alto contraste con un foco visual;
- `editorial-photo` — fotografía o composición fotográfica editorial con texto integrado;
- `data-poster` — un dato, contraste o relación visual dominante;
- `quote-statement` — una declaración, cita o frase atribuida como centro de la pieza;
- `character-explainer` — Richard u otro personaje aprobado explicando el mecanismo o consecuencia.

Objetivo de cartera para las primeras 20 publicaciones:

| Tratamiento | Objetivo |
| --- | ---: |
| `hero-graphic` | 40% |
| `editorial-photo` | 25% |
| `data-poster` | 15% |
| `quote-statement` | 10% |
| `character-explainer` | 10% |

La selección ocurre a nivel de publicación/carrusel para que todas sus slides compartan medio y dirección. La variedad se controla entre publicaciones, no mezclando cinco estilos dentro de un mismo carrusel.

## Decisiones de diseño

- Los tratamientos son una capa de dirección visual; no sustituyen `CreativeFormat` (`meme`, `carousel`, `sequence`) ni `VisualFidelityMode`.
- La primera entrega puede alimentar el tratamiento a `visualDirection` y al snapshot existente. No se debe crear un compositor nuevo para cada tratamiento antes de validar el comportamiento.
- La paleta, tipografía, logo, proporción y legibilidad siguen siendo parte de la marca. Variar composición no significa variar arbitrariamente la identidad.
- `editorial-photo` no autoriza inventar una fotografía documental. Para lugares, personas o hechos reales se respetan las políticas de referencia, evidencia, atribución y derechos existentes.
- `data-poster` solo puede representar valores exactos suministrados por los hechos. Una dirección o ranking sin números no puede convertirse en un gráfico proporcional.
- `quote-statement` exige atribución y preserva los calificadores de la fuente.
- `character-explainer` usa únicamente personajes aprobados y no debe convertir al personaje en evidencia del hecho.
- El editor puede aceptar el tratamiento recomendado o elegir otro tratamiento compatible antes de generar; el cambio crea una nueva revisión del draft y no muta assets aprobados.
- Los tratamientos y prompts usados quedan congelados en el snapshot de cada resultado.

## Selección inicial por ángulo

Esta es una preferencia de decisión, no una matriz rígida:

| Ángulo editorial | Tratamientos preferidos |
| --- | --- |
| `everyday-impact` | `editorial-photo`, `hero-graphic` |
| `wtf-capability` | `hero-graphic`, `character-explainer` |
| `power-shift` | `editorial-photo`, `quote-statement` |
| `risk-explainer` | `data-poster`, `hero-graphic` |
| `industry-deep-dive` | `data-poster`, `hero-graphic` |

El selector debe poder escoger otra opción cuando la evidencia, los recursos disponibles o la fidelidad visual lo exijan.

## Flujo

1. El brief o planner recibe el ángulo editorial y la distribución visual reciente.
2. El sistema recomienda un tratamiento y explica por qué sirve para esa historia.
3. El editor revisa el tratamiento y puede cambiarlo por uno permitido.
4. La generación usa una dirección visual específica y reproducible para todo el carrusel.
5. El draft guarda el tratamiento elegido, el override, la guía efectiva y el snapshot de cada asset.
6. Una regeneración o edición conserva la identidad del tratamiento salvo que el editor cree una revisión nueva.

## Tareas

### VISUAL-01 — Definir tratamientos y compatibilidad

**Prioridad:** P0 · **Dependencias:** ninguna

- Añadir un tipo cerrado para los cinco tratamientos.
- Definir fallback para drafts históricos sin tratamiento.
- Mantener separados tratamiento visual, formato de publicación, fidelidad documental y referencias de marca.
- Definir compatibilidades mínimas con `meme`, `carousel`, `sequence` y `photo-required`.

### VISUAL-02 — Seleccionar tratamiento según historia y cartera

**Prioridad:** P0 · **Dependencias:** VISUAL-01, ANGLE-01

- Crear una selección determinista a partir de ángulo, facts, `visualFidelityMode`, referencias disponibles y tratamientos recientes.
- Aplicar la distribución 40/25/15/10/10 como preferencia de cartera.
- No seleccionar `data-poster` sin valores representables ni `quote-statement` sin una cita o declaración atribuible.
- No seleccionar `character-explainer` si no existe un personaje aprobado o si el tratamiento degradaría la claridad.
- Devolver tratamiento, razón, confianza y fallback.

### VISUAL-03 — Actualizar las instrucciones de generación

**Prioridad:** P0 · **Dependencias:** VISUAL-01, VISUAL-02

- Añadir instrucciones específicas para composición, foco, jerarquía, espacio negativo y relación con el hook.
- Mantener una sola dirección de medio para todas las slides del carrusel.
- Impedir labels, logos, marcas, flechas o texto adicional inventado dentro de `visualDirection`.
- Mantener 4:5 a 1080×1350 para feed, salvo configuración explícita existente.
- Exigir que el tratamiento visual apoye la historia y no sea un adorno tecnológico genérico.

### VISUAL-04 — Permitir revisión y override humano

**Prioridad:** P1 · **Dependencias:** VISUAL-02, VISUAL-03

- Mostrar tratamiento recomendado, razón y fallback en el draft.
- Permitir seleccionar otro tratamiento compatible antes de generar.
- Guardar el override dentro de una nueva revisión del draft.
- No cambiar silenciosamente imágenes ya generadas, aprobadas o publicadas.

### VISUAL-05 — Versionar snapshot y conservar históricos

**Prioridad:** P0 · **Dependencias:** VISUAL-03

- Guardar tratamiento, guía efectiva, referencias, política visual y prompt usado por resultado.
- Una regeneración con tratamiento distinto crea assets candidatos nuevos y conserva los anteriores.
- Una edición de texto que no cambia tratamiento puede conservar assets cuando las reglas existentes lo permiten.
- Una publicación remota permanece vinculada a su snapshot original.

### VISUAL-06 — Verificación automatizada y revisión visual

**Prioridad:** P0 · **Dependencias:** VISUAL-01 a VISUAL-05

- Añadir pruebas unitarias del selector y de compatibilidades.
- Añadir pruebas de prompts y snapshots.
- Añadir pruebas de seguridad documental, referencias, logos y proporciones.
- Crear una matriz visual de cinco historias representativas y revisar móvil, contraste, jerarquía y repetición entre publicaciones.

## Pruebas obligatorias para cerrar la feature

- Un tratamiento inválido o desconocido activa un fallback seguro.
- El selector respeta el ángulo y puede explicar su decisión.
- La cuota visual influye en la cartera, pero no fuerza un tratamiento incompatible con la evidencia.
- `data-poster` rechaza gráficos proporcionales cuando faltan valores exactos.
- `quote-statement` exige cita o declaración atribuible y conserva sus calificadores.
- `character-explainer` rechaza personajes no aprobados y no los trata como fuente de evidencia.
- `editorial-photo` respeta `VisualFidelityMode`, permisos, referencias y restricciones de lugares reales.
- Todo el carrusel usa el mismo medio visual y no mezcla tratamientos accidentalmente entre slides.
- `visualDirection` no solicita texto, logos, marcas, flechas o números que el renderer no controla.
- Se conserva 4:5/1080×1350 cuando esa es la configuración del perfil.
- Un override humano crea una revisión nueva y no muta el draft aprobado anterior.
- Una regeneración conserva el resultado anterior, su snapshot y su aprobación histórica.
- Una publicación existente sigue apuntando al tratamiento y asset exactos con los que fue aprobada.
- Los drafts históricos sin tratamiento siguen cargando con el fallback compatible.
- El selector no expone claves R2, URLs privadas de larga duración ni credenciales al navegador.

## Comandos de validación

```text
npm test
npm run lint
npm run build
```

`npm run db:check` solo es obligatorio si el contrato no puede guardarse en los snapshots/versiones existentes y se necesita una migración.

## Definition of done

- Los drafts nuevos tienen tratamiento visual y razón estructurados.
- La recomendación usa la cartera visual sin romper evidencia ni políticas.
- El editor puede revisar y, en la entrega P1, cambiar el tratamiento antes de generar.
- Las instrucciones producen variación real de composición manteniendo la identidad Craftor.
- Históricos, aprobaciones, referencias y publicaciones remotas permanecen intactos.
- Pasan las pruebas obligatorias, lint, build y la revisión visual de la matriz inicial.
