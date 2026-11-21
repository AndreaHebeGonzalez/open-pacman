# SPEC 03 — Power pellets y fantasmas comestibles

> **Status:** Approved
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-11-21
> **Objective:** Añadir cuatro power pellets cerca de las esquinas que activan 8 s de modo asustado, con fantasmas más lentos y comestibles que puntúan en combo y vuelven a la pen convertidos en ojos.

## Por qué esta spec

SPEC 01 dejó el modo asustado fuera de alcance y SPEC 02 preparó la puerta de tránsito y documentó el contrato de la fase `returning` para los ojos. Las dos piezas existen y no se usan: hoy la puerta solo se abre para `leaving` y no hay nada que comer. Esta spec cierra ese contrato sin tocar `isWall` ni la geometría.

## Scope

**In:**

- Tile `4` para power pellet en `MAZE`, con cuatro celdas: `(1,5)`, `(26,5)`, `(1,26)`, `(26,26)`.
- Dibujo del pellet grande en `render.js`.
- Comer pellet: `+50`, desaparece y cuenta para ganar.
- Estado global `frightenedFrames` de 480 frames (~8 s), con parpadeo en los últimos 120.
- Fantasmas asustados a `1/16` celda/frame y movimiento aleatorio en cada celda.
- Pausa de `modeFrames` mientras dura el susto.
- Fantasmas comestibles con combo `200 / 400 / 800 / 1600`.
- Fase `returning`: ojos que ignoran colisiones, cruzan la puerta y salen de nuevo.
- Limpieza del susto y del combo al perder una vida.
- Actualización de `AGENTS.md`.

**Out of scope (para futuras specs):**

- Sonido, HUD con estado del susto y cuentas atrás.
- Fruta, niveles, velocidad progresiva o tabla de fases del arcade.
- Pellets que reaparezcan al perder una vida o al cambiar de nivel.
- Tests automáticos (el proyecto no tiene runner).
- Cambios en roles, túnel, `scatter`/`chase` o en las reglas de la puerta.

## Data model

Geometría en `maze.js`:

```js
// Valores del grid: 1 pared · 2 dot · 3 puerta · 4 power pellet · 0 libre.
'#O........................O#', // 5   pellets (1,5) y (26,5)
'#O.....##....##....##.....O#', // 26  pellets (1,26) y (26,26)
```

`parseTile` añade `if ( ch === 'O' ) return 4;`. No hay lista de posiciones: el tile es la fuente de verdad y el grid de cada partida ya copia `MAZE`.

Constantes en `game.js`:

```js
const POWER_PELLET_POINTS = 50;
const FRIGHTENED_FRAMES = 480;        // 8 s a 60 fps
const FRIGHTENED_FLASH_FRAMES = 120;  // últimos 2 s parpadeando
const FRIGHTENED_SPEED = 0.0625;      // 1/16 celda/frame
const GHOST_EAT_SCORES = [ 200, 400, 800, 1600 ];
```

Estado de partida:

```js
{
  score, lives, dotsRemaining,          // dotsRemaining cuenta tiles 2 y 4
  mode: 'scatter' | 'chase',
  modeFrames,
  frightenedFrames: 0,                  // 0 = sin susto
  ghostCombo: 0,                        // índice actual en GHOST_EAT_SCORES
  ghosts: [
    { x, y, dir, speed, kind, home: { x, y }, releaseFrames, phase },
  ],
}
```

Convenciones:

- `phase` pasa a `'waiting' | 'leaving' | 'roaming' | 'returning'`.
- `home` es una copia de la celda de `GHOST_STARTS` del fantasma; no se busca por índice ni por `kind`.
- El susto es **global** (`frightenedFrames`), no un booleano por fantasma: el arcade lo trata así y evita cuatro temporizadores que se desincronizan.
- `ghostSpeed( game, ghost )` devuelve la velocidad objetivo: `FRIGHTENED_SPEED` si hay susto y `phase === 'roaming'`; en cualquier otro caso `GHOST_SPEED` (1/10).
- `ghost.speed` guarda la velocidad activa y solo se actualiza en el bloque alineado de `moveGhost`. Cambiarla a mitad de celda desalinea al fantasma para siempre: desde un desplazamiento de `5/80`, pasos de `8/80` no vuelven a un entero.
- `ghostActor` devuelve `'penGhost'` para `leaving` y `returning`.
- El tile `4` es transitable: `isWall` solo bloquea `1` y `3`, así que no se toca.
- Toda transición de velocidad ocurre en una celda entera: desde un entero, `1/16` vuelve a alinear en 16 frames y `1/10` en 10.
- Tiempo en frames, como `speed` y `modeFrames`.

## Comportamiento

- `createGame` cuenta los tiles `2` y `4` en `dotsRemaining`, inicializa `frightenedFrames: 0`, `ghostCombo: 0` y el `home` de cada fantasma.
- `movePacman`: comer `2` suma 10; comer `4` suma 50, pone el tile a `0`, decrementa `dotsRemaining` y llama a `startFrightened( game )`.
- `startFrightened`: `frightenedFrames = FRIGHTENED_FRAMES` y `ghostCombo = 0`. Comer otro pellet reinicia ambos.
- `update`, en este orden: decrementa `frightenedFrames` si es mayor que 0, mueve a Pac-Man y solo llama a `updateMode` si no hay susto.
- `decideGhost`, por orden:
  1. `returning`: si no está en `home`, va hacia `home` con BFS; al llegar pasa a `leaving`.
  2. `roaming` con susto: dirección aleatoria entre `forwardDirections`, igual que el `wanderer`.
  3. Guarda de la pen, `leaving` y lógica de rol como hoy.
- Colisiones:
  - `returning` nunca colisiona.
  - Con susto activo, el fantasma pasa a `returning`, suma `GHOST_EAT_SCORES[ Math.min( ghostCombo, 3 ) ]` e incrementa `ghostCombo`. No se pierde vida ni se resetea nada.
  - Sin susto, se pierde una vida como hoy.
- `moveGhost` fija `ghost.speed = ghostSpeed( game, ghost )` solo al llegar a una celda entera.
- `resetPositions` vuelve a `phase: 'waiting'`, `frightenedFrames = 0` y `ghostCombo = 0`. Los pellets ya comidos siguen comidos, igual que los dots.
- `render.js`: tile `4` con radio `TILE * 0.3`; fantasma asustado con cuerpo azul `#2121ff` y ojos blancos sin dirección; en los últimos 120 frames el cuerpo alterna azul y blanco cada 15 frames (`Math.floor( frame / 15 ) % 2`); `returning` dibuja solo los ojos, sin cuerpo.
- Ganar sigue siendo `dotsRemaining <= 0`, ahora con pellets incluidos.

## Implementation plan

1. **`maze.js` + `render.js` + `game.js`: pellet en el mapa.** Añadir `'O' → 4`, las cuatro celdas de las bandas superior e inferior y el mapa de caracteres del comentario. Dibujar el tile `4` como dot grande. Contar tiles `2` y `4` en `dotsRemaining`; en `movePacman`, comer `4` suma 50 y desaparece. Manual: se ven cuatro pellets grandes cerca de las esquinas, dan 50, se gastan y la partida termina al comer el último dot o pellet.
2. **`game.js`: estado de susto.** Añadir constantes, `frightenedFrames`, `ghostCombo` y `startFrightened`; pausar `updateMode`; aplicar `ghostSpeed` en `moveGhost` solo en celdas enteras (el fantasma conserva su `speed` hasta la siguiente); limpiar el susto en `resetPositions`. En `render.js`, cuerpo azul y parpadeo final. Manual: comer un pellet pone a los cuatro azules y lentos durante 8 s, parpadean los últimos 2 y luego recuperan color, velocidad y comportamiento; perder una vida deja de estar asustado.
3. **`game.js`: movimiento asustado.** En `decideGhost`, un `roaming` con susto elige dirección al azar en cada celda. Manual: los azules no persiguen ni van a su esquina de dispersión.
4. **`game.js`: fase `returning`.** Añadir `home`, ampliar `ghostActor`, resolver `returning` en `decideGhost`, ignorar colisiones y no matar con ellos. En `render.js`, dibujar solo los ojos. Manual: al comer un fantasma se convierte en ojos, cruza la puerta, llega a su celda de `GHOST_STARTS` y vuelve a salir como `roaming`.
5. **`game.js`: combo.** Puntuar con `GHOST_EAT_SCORES`, tope en el último valor, reseteo al comer otro pellet y al perder una vida. Manual: en un mismo susto se suman 200, 400, 800 y 1600.
6. **`AGENTS.md`: convenciones.** Documentar el tile `4`, el susto global, la velocidad derivada, `returning` y el contrato de la puerta. Manual: leer la sección y comprobar que no contradice el código.

## Acceptance criteria

- [ ] Al abrir `src/index.html` la consola no muestra errores.
- [ ] Hay exactamente cuatro pellets grandes en `(1,5)`, `(26,5)`, `(1,26)` y `(26,26)`, y ninguna otra celda con tile `4`.
- [ ] Comer un pellet suma 50 puntos y la celda queda vacía.
- [ ] Un pellet comido no reaparece al perder una vida.
- [ ] La partida se gana al comer todos los dots y todos los pellets.
- [ ] Comer un pellet pone a los cuatro fantasmas en azul 480 frames y parpadean los últimos 120.
- [ ] Mientras dura el susto, `modeFrames` no cambia y los fantasmas se mueven a `1/16` sin salirse de la rejilla.
- [ ] Los fantasmas asustados eligen dirección al azar y no persiguen a Pac-Man.
- [ ] Al terminar el susto recuperan color, velocidad y rol; en los 500 frames siguientes ningún fantasma atraviesa una pared ni queda desalineado.
- [ ] Tocar un fantasma asustado no resta vidas: lo convierte en ojos.
- [ ] En un mismo susto, comer fantasmas suma 200, 400, 800 y 1600 en ese orden.
- [ ] Comer otro pellet reinicia el susto a 480 frames y el combo a 200.
- [ ] Los ojos atraviesan la puerta, llegan a su `home` y salen de la pen como `roaming`.
- [ ] Un `returning` no puede matar a Pac-Man, ni siquiera al otro lado de la puerta.
- [ ] Perder una vida apaga el susto, resetea el combo y devuelve a los cuatro a `waiting`.
- [ ] La puerta sigue bloqueada para `roaming` y el túnel funciona igual.
- [ ] `AGENTS.md` describe el tile `4`, el susto global y la fase `returning`.

## Decisions

- **Sí:** tile `4` en `MAZE`. Una sola fuente de verdad para posición, dibujo y conteo; `isWall` ya lo trata como transitable.
- **No:** lista `POWER_PELLETS` aparte. Duplicaría la geometría y haría falta un `Set` de comidos por partida.
- **Sí:** bandas `5/26` en los laterales. Quedan al final de los corredores de las cuatro esquinas, son simétricas respecto al centro (`5 + 26 = 31`) y bajan el trayecto desde el inicio a 30-31 / 15-16 celdas.
- **No:** esquinas literales `(1,1)/(26,1)/(1,29)/(26,29)`. Son las más lejanas (34-35 celdas arriba) y no aportan nada sobre las bandas.
- **No:** bandas `3/27`. Solo ganan dos celdas de camino y quedan más pegadas al muro.
- **No:** disposición clásica `(1,3)/(26,3)/(1,23)/(26,23)`. No son esquinas y mezclan dos criterios de posición.
- **Sí:** susto global de 480 frames. Más fácil de leer y de reiniciar que cuatro temporizadores por fantasma.
- **Sí:** 8 s con parpadeo final. Da margen para encadenar fantasmas y el parpadeo avisa sin HUD.
- **Sí:** velocidad `1/16`. Se nota el susto y, al aplicarse solo en celdas enteras, no rompe `aligned()`.
- **No:** velocidad arbitraria como `0.06`. Rompería la alineación con la rejilla y el fantasma podría atravesar paredes.
- **Sí:** `ghostSpeed` calcula la velocidad objetivo y `moveGhost` la aplica solo al pisar una celda entera. Es la única transición que conserva la alineación con la rejilla.
- **No:** cambiar la velocidad a mitad de celda. Con `1/16` y `1/10` hay desplazamientos desde los que nunca se vuelve a un entero y el fantasma atraviesa paredes.
- **No:** cuantizar la posición al cambiar de velocidad. Corrige el caso, pero mueve al fantasma hasta 0.05 celda y es más difícil de razonar.
- **Sí:** movimiento aleatorio en cada celda. Reutiliza `forwardDirections` y la lógica del `wanderer`; la huida por BFS añade código sin cambiar la experiencia.
- **Sí:** combo `200/400/800/1600`. Es la regla del arcade y premia encadenar dentro de un solo susto.
- **Sí:** el regreso usa `home` copiado en `createGame`. Evita buscar el índice del fantasma en cada decisión.
- **Sí:** al llegar a `home` pasa directo a `leaving`, sin `waiting`. No hay razón para volver a esperar el turno de salida.
- **Sí:** los ojos van a velocidad normal. Duplicarla, como el arcade, añade una tercera velocidad y otra transición de retícula sin ganancia clara.
- **Sí:** `dotsRemaining` cuenta dots y pellets. Un solo contador elimina el riesgo de ganar con pellets pendientes.
- **No:** pellets que reaparezcan al perder una vida. El resto del grid tampoco se resetea y la partida se haría interminable.
- **Sí:** ignorar colisiones en `returning`. Cumple el contrato que dejó SPEC 02.
- **No:** tocar `isWall`, `PEN_AREA`, `nextCell`, roles, túnel ni la puerta. La puerta ya es de tránsito para `penGhost`.
- **No:** sonido, HUD del susto, fruta y niveles. Cada uno va en su propia spec.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El cambio de velocidad desalinea al fantasma y atraviesa una pared | `ghostSpeed` se aplica solo en celdas enteras; verificado en simulación headless con transiciones en ambos sentidos. |
| El bucle de colisiones corta al primer fantasma y no reparte combo | Tras comer un fantasma se usa `continue`, no `break`; solo la muerte corta el bucle. |
| Índice de combo fuera de rango con más de cuatro fantasmas | `Math.min( ghostCombo, GHOST_EAT_SCORES.length - 1 )`. |
| Un `returning` se queda atascado fuera de la pen | `home` está dentro de `PEN_AREA` y el actor `'penGhost'` cruza la puerta; BFS ya resuelve la ruta. |
| El parpadeo congela el cuerpo en un solo color | Alternancia derivada de `frame` cada 15 frames, sin estado extra. |
| `render.js` necesita `FRIGHTENED_FLASH_FRAMES` | `game.js` se carga antes en `index.html`; el orden ya es una dependencia real del proyecto. |
| Comer un pellet y un fantasma en el mismo frame | `movePacman` fija `frightenedFrames` antes del bucle de colisiones, así que el fantasma es comestible ya en ese frame. |
| El susto sigue activo al perder una vida | `resetPositions` limpia `frightenedFrames` y `ghostCombo`. |

## What is **not** in this spec

- Sonido, HUD del susto y cuentas atrás.
- Fruta, niveles y velocidad progresiva.
- Tabla de fases del arcade.
- Pellets que reaparezcan al morir o al cambiar de nivel.
- Tests automáticos.

Cada uno de esos, si llega, va en su propia spec.
