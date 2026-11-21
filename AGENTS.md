# AGENTS.md

Pac-Man MVP en Vanilla JS + Canvas. Sin build, sin dependencias, sin tests.

## Ejecutar

Abrir `src/index.html` en el navegador. No hay `package.json`, bundler ni servidor: son scripts clásicos, así que `file://` funciona (no introduzcas `type="module"` ni `fetch` sin añadir un servidor).

## Arquitectura

Cuatro scripts globales cargados en este orden exacto en `src/index.html` (el orden es una dependencia real, no cosmética):

1. `maze.js` → `MAZE` (matriz prístina), `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS`, `PEN_EXIT`, `PEN_AREA`.
2. `game.js` → estado y reglas. **No toca el DOM.** Usa los globales de `maze.js`.
3. `render.js` → dibujo. **No muta el estado.** Usa `DIRS` de `game.js`.
4. `main.js` → `requestAnimationFrame`, teclado y overlay.

Regla al añadir un archivo: nuevo `<script>` en `index.html` en la posición correcta del orden anterior.

Separación intencional: `game.js` es lógica pura sobre el estado; `render.js` solo lee. No mezcles dibujo dentro de `update` ni lógica de juego dentro de `draw`.

## Convenciones críticas

- **`MAZE` nunca se muta.** Cada partida copia filas en `game.grid` (`createGame`) y todo el juego lee/escribe `game.grid`.
- **Valores del grid:** `1` pared, `2` dot, `3` puerta de la pen, `0` libre. La puerta bloquea a `pacman` y a `ghost`; solo la cruza `penGhost`. Cualquier actor nuevo debe pasar `actor` a `isWall`/`canMove`.
- **Fases de fantasma:** `phase: 'waiting' | 'leaving' | 'roaming'`. `waiting` espera en la pen, `leaving` va a `PEN_EXIT`, `roaming` juega. `ghostActor()` decide quién cruza la puerta; la futura fase `returning` de power pellets se añade ahí. `PEN_AREA` delimita la pen, puerta incluida.
- **Coordenadas en celdas, fraccionarias.** Los actores se mueven `speed` celdas/frame y solo *deciden* cuando `aligned()` es cierto. Velocidades actuales: `1/8` (Pac-Man) y `1/10` (fantasmas). Cambiar una velocidad a un valor arbitrario (p. ej. `0.13`) rompe la alineación con la rejilla: usa fracciones `1/n`.
- **Túnel:** solo la fila `TUNNEL_ROW` (14) hace wrap. Un actor nuevo debe llamar a `wrapTunnel` tras moverse o se saldrá del canvas.
- **Canvas = 28×31 celdas × `TILE` 20 = 560×620.** Si cambias `TILE` o el tamaño del laberinto, actualiza `width`/`height` del `<canvas>` y `#game-wrap` en `style.css`.
- Estilo del código existente: 2 espacios, comillas simples, espacios dentro de paréntesis (`canMove( grid, x, y )`), punto y coma. Respétalo.

## Gotchas

- `showOverlay()` reemplaza todo el `innerHTML` del overlay, así que el `<p>` con las instrucciones del HTML inicial desaparece tras el primer reinicio. Si añades UI al overlay, va dentro de `showOverlay`, no en `index.html`.
- `const actionBtn` en `main.js` queda apuntando a un nodo eliminado tras el primer overlay; el listener real lo engancha `showOverlay`. No lo uses como fuente de verdad.
- `score`, `lives` y `grid` **no** se resetean al perder una vida: solo `resetPositions()`. Reiniciar partida = `createGame()`.
- El HUD se dibuja en el canvas (`drawHUD`), no es HTML.
- La pen es de tránsito: un `roaming` nunca debe cruzar la puerta. Si añades un estado que vuelva a la pen, amplía `ghostActor`, no `isWall`.

## Flujo de trabajo (spec-driven)

Este repo usa skills de spec: `.agents/skills/spec` y `.agents/skills/spec-impl`. Las specs van en `specs/NN-slug.md`. `skills-lock.json` lo genera el instalador de skills: no editarlo a mano.

Si el usuario invoca `/spec`, no escribas código: solo la spec. Si invoca `/spec-impl`, implementa únicamente lo que dice la spec aprobada, paso a paso. Fuera de esas skills, haz solo lo que se pida.
