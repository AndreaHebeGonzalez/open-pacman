# SPEC 01 — Cuatro fantasmas con personalidad propia

> **Status:** Implementado
> **Depends on:** —
> **Date:** 2026-11-19
> **Objective:** Dar al juego cuatro fantasmas con comportamiento distinto —persecución por camino más corto, emboscada, flanqueo y deambuleo aleatorio— y fases alternas de dispersión y persecución.

## Por qué esta spec

Hoy los fantasmas se distinguen por un único `if` (`hunter` vs `random`), comparten la misma decisión por distancia Manhattan y no tienen forma fiable de salir de la pen. Esta spec convierte `kind` en cuatro roles reales y añade el estado mínimo (salida escalonada y modo global) que hace falta para que se comporten distinto.

## Scope

**In:**

- Cuatro `kind`: `chaser`, `ambusher`, `flanker`, `wanderer`.
- Salida de la pen escalonada cada `GHOST_RELEASE_FRAMES` (90 frames ≈ 1,5 s, configurable).
- Búsqueda en anchura (BFS) sobre celdas para salir de la pen y para el cazador, con soporte del túnel.
- Fases `scatter` / `chase` alternas de 420 / 1200 frames (7 s / 20 s), en bucle infinito.
- Una esquina de dispersión fija por rol.
- Color fijo por rol en `render.js`.
- Reinicio de posiciones y de la salida escalonada al perder una vida.

**Out of scope (para futuras specs):**

- Power pellets, modo asustado y comer fantasmas.
- Respawn de fantasmas comidos o vuelta a la pen tras morir.
- Tabla de fases fiel al arcade y progresión por nivel.
- Velocidad progresiva o distinta por fantasma.
- Mostrar el modo (`scatter`/`chase`) en el HUD.
- Tests automáticos (el proyecto no tiene runner) y sonido.

## Data model

Geometría en `maze.js` (sigue siendo el único sitio con coordenadas del laberinto):

```js
const GHOST_STARTS = [
  { x: 12, y: 14, kind: 'chaser' },
  { x: 13, y: 14, kind: 'ambusher' },
  { x: 14, y: 14, kind: 'flanker' },
  { x: 15, y: 14, kind: 'wanderer' },
];
const PEN_EXIT = { x: 13, y: 11 };
```

Comportamiento en `game.js` (las reglas no viven en la geometría):

```js
const GHOST_RELEASE_FRAMES = 90;  // frames entre salidas (90 ≈ 1,5 s a 60 fps)
const SCATTER_FRAMES = 420;       // 7 s
const CHASE_FRAMES = 1200;        // 20 s
const AMBUSH_LEAD = 4;            // celdas por delante que apunta el emboscador

const SCATTER_TARGETS = {
  chaser: { x: 26, y: 1 },
  ambusher: { x: 1, y: 1 },
  flanker: { x: 26, y: 29 },
  wanderer: { x: 1, y: 29 },
};
```

Estado de partida:

```js
{
  mode: 'scatter' | 'chase',
  modeFrames: 420,               // cuenta atrás hasta el cambio de modo
  ghosts: [
    { x, y, dir, speed, kind, releaseFrames, leaving },
  ],
}
```

Convenciones:

- `releaseFrames` arranca en `index * GHOST_RELEASE_FRAMES` (0, 90, 180, 270) y baja de 1 en 1 por frame.
- `leaving` es `true` desde `createGame` y `resetPositions`; pasa a `false` al llegar a `PEN_EXIT`. Se usa un booleano, no la posición, porque la puerta `(13,12)` queda fuera del rango de filas de la pen y un cálculo por coordenadas devolvería al fantasma hacia dentro.
- El tiempo se mide en frames, como ya hace el movimiento (`speed` en celdas/frame). No se introduce `deltaTime`.

## Comportamiento por rol

Cada rol se define como una función que devuelve una celda objetivo. `wanderer` no tiene objetivo.

| Rol | Objetivo en `chase` | Movimiento |
| --- | --- | --- |
| `chaser` | Celda actual de Pac-Man | BFS al camino más corto |
| `ambusher` | Celda de Pac-Man + `AMBUSH_LEAD` en su dirección, acotada a la rejilla | BFS si la celda es transitable; si no, greedy Manhattan |
| `flanker` | Espejo de Pac-Man respecto a sí mismo: `2*pac - g`, acotado a la rejilla | BFS si es transitable; si no, greedy Manhattan |
| `wanderer` | Ninguno | Aleatorio entre las direcciones legales, en ambas fases |

En `scatter` los tres primeros usan su entrada de `SCATTER_TARGETS`. `wanderer` sigue aleatorio.

## Implementation plan

1. **`maze.js`: cuatro inicios y salida de la pen.** Añadir los dos fantasmas que faltan en `GHOST_STARTS`, renombrar los `kind` y exportar `PEN_EXIT`. Manual: abrir `index.html`, no hay errores en consola y se ven cuatro fantasmas dentro de la pen.
2. **`game.js`: salida de la pen con BFS.** Extraer `nextCell( grid, x, y, dir, actor )` (devuelve la celda destino o `null`, resuelve el wrap del túnel) y reescribir `canMove` sobre él. Añadir `bfsDistances( grid, target, actor )` y `chooseDirection( game, g, target )` (BFS si el objetivo es transitable, greedy Manhattan si no). Añadir `releaseFrames` y `leaving`; el fantasma en espera no se mueve y el que está saliendo va a `PEN_EXIT`. Manual: los cuatro salen de la pen de uno en uno y ninguno se queda atascado dentro.
3. **`game.js`: cazador.** `kind === 'chaser'` sigue a Pac-Man con BFS. Manual: el rojo llega hasta Pac-Man sin oscilar entre dos celdas, incluso cruzando el túnel.
4. **`game.js`: emboscador.** Objetivo `AMBUSH_LEAD` celdas por delante, acotado a la rejilla, con fallback greedy. Manual: con Pac-Man yendo a la derecha por el pasillo central, el rosa se adelanta en lugar de seguirlo.
5. **`game.js`: flanqueador.** Objetivo espejo, acotado a la rejilla, con fallback greedy. Manual: el cian corta el paso desde un lateral en vez de ir por detrás.
6. **`game.js`: fases scatter/chase.** Añadir `mode` y `modeFrames` a `createGame`, el cambio de fase en `update` y los objetivos de dispersión. `wanderer` ignora la fase. Manual: a los ~7 s cada fantasma se va a su esquina y a los ~27 s vuelve a perseguir.
7. **`render.js`: colores por rol.** Reordenar `GHOST_COLORS` a `['#ff0000', '#ffb8ff', '#00ffff', '#ffb852']` para que rojo/rosa/cian/naranja correspondan a `GHOST_STARTS`. Manual: cada fantasma mantiene su color después de perder una vida.

## Acceptance criteria

- [ ] Al abrir `src/index.html` la consola no muestra errores.
- [ ] Hay exactamente cuatro fantasmas, cada uno con un color distinto y estable.
- [ ] El primero sale de la pen de inmediato y los otros tres lo hacen con ~1,5 s de diferencia.
- [ ] Ningún fantasma queda atascado dentro de la pen durante 30 s de observación.
- [ ] En fase de persecución, el rojo alcanza a Pac-Man sin quedarse oscilando entre dos celdas.
- [ ] Con Pac-Man atravesando el túnel, el rojo usa el túnel como atajo cuando acorta la ruta.
- [ ] El rosa se coloca delante de Pac-Man; el cian tiende a cortarle el paso desde un lateral.
- [ ] El naranja se mueve al azar tanto en dispersión como en persecución.
- [ ] A los ~7 s de partida los cuatro se dirigen a su esquina; a los ~27 s vuelven a perseguir.
- [ ] Perder una vida devuelve los cuatro a la pen y repite la salida escalonada.
- [ ] Cambiar `GHOST_RELEASE_FRAMES` por `180` dobla el intervalo entre salidas sin tocar nada más.

## Decisions

- **Sí:** BFS para el cazador. Garantiza persecución real y elimina los mínimos locales del greedy.
- **No:** greedy Manhattan para el cazador. Simple, pero se queda en bucles y "parece que no persigue".
- **Sí:** BFS también para salir de la pen. La pen es una caja con una sola puerta; cualquier lógica por distancia se atasca dentro.
- **Sí:** `nextCell` como única fuente de verdad de muros, puerta y túnel, compartida por movimiento y BFS. Evita que el pathfinding y el movimiento discrepen.
- **Sí:** frames como unidad de tiempo. Es la unidad que ya usa `speed`; no mezclamos relojes.
- **No:** `deltaTime` y temporizadores en milisegundos. Fuera del patrón actual del proyecto.
- **Sí:** `leaving` como booleano explícito. Derivarlo de coordenadas falla en la puerta `(13,12)`.
- **Sí:** cuatro inicios en fila dentro de la pen. Es la opción elegida y cabe en el interior (columnas 11–16).
- **Sí:** interceptar con reglas distintas (4 celdas delante, espejo) en lugar de replicar las fórmulas exactas del arcade. Da personalidad legible sin arrastrar reglas que nadie va a mantener.
- **Sí:** una esquina por rol. Reparte el mapa y hace visible la dispersión.
- **Sí:** empezar en `scatter`. Da 7 s de margen inicial y coincide con el arcade.
- **No:** tabla de fases del arcade. Un par de valores en bucle es igual de jugable y mucho más fácil de ajustar.
- **Sí:** reiniciar `releaseFrames` y `leaving` al perder una vida, pero **no** el temporizador de fase. Reiniciar el modo permitiría encadenar dispersiones indefinidamente.
- **Sí:** permitir el giro de 180 cuando se sigue un mapa de distancias BFS. La distancia siempre decrece, así que no hay oscilación, y refleja mejor la persecución. La regla de no-180 se mantiene para aleatorio y greedy.
- **No:** clases ni objetos con métodos por rol. Un mapa `kind → función de objetivo` y `switch` en `decideGhost` respetan el estilo funcional del proyecto.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Pantalla a 120 Hz: las fases duran la mitad en tiempo real | Constantes en frames, documentadas y ajustables en un solo sitio. |
| Dos fantasmas saliendo a la vez se solapan en la columna de la puerta | 90 frames de separación frente a ~30 frames de recorrido hasta la salida. |
| Objetivos de emboscador/flanqueador caen en pared o fuera del mapa | Acotar a la rejilla y usar greedy Manhattan cuando la celda no es transitable. |
| El BFS ignora el túnel y el cazador da un rodeo | `nextCell` resuelve el wrap y lo comparten BFS y movimiento. |
| BFS por fantasma en cada decisión | 4 × ~868 celdas cada ~10 frames: coste despreciable para el canvas. |

## What is **not** in this spec

- Power pellets y modo asustado.
- Comer fantasmas y su respawn en la pen.
- Tabla de fases del arcade y progresión por nivel.
- HUD que muestre el modo actual.
- Tests automáticos y sonido.

Cada uno de esos, si llega, va en su propia spec.
