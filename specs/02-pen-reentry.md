# SPEC 02 — Puerta de tránsito contra fantasmas atrapados en la pen

> **Status:** Approved
> **Depends on:** SPEC 01
> **Date:** 2026-11-20
> **Objective:** Evitar que un fantasma en estado normal vuelva a entrar en la pen, con una puerta de tránsito que la futura spec de power pellets reutilizará para el regreso de los ojos.

## Por qué esta spec

`leaving` es un booleano que pasa a `false` al llegar a `PEN_EXIT` y no vuelve a `true`. La celda `3` de la puerta solo bloquea a Pac-Man, así que cualquier fantasma puede cruzar la puerta en cualquier momento. Como el interior de la pen es un callejón sin salida, un fantasma que entra por error se queda circulando.

Se reprodujo sin render, con 100 partidas de 60.000 frames: el `wanderer` reentró en 25 partidas, el `flanker` en 4 y el `ambusher` en 1. Hubo rachas de hasta 505 frames dentro. La salida inicial siempre fue correcta.

Cerrar la puerta para todos no sirve: la spec de power pellets necesitará que los ojos comidos vuelvan a la pen. Por eso la puerta debe ser de tránsito, no un muro.

## Scope

**In:**

- `PEN_AREA` en `maze.js` para describir la pen, puerta incluida.
- `phase` por fantasma: `waiting`, `leaving`, `roaming`, en sustitución de `leaving`.
- Actor `penGhost` y regla de puerta en `isWall`.
- Descarte de objetivos que caigan dentro de la pen.
- Guarda de recuperación para un `roaming` que aparezca dentro.
- Actualización de las convenciones afectadas en `AGENTS.md`.

**Out of scope (para futuras specs):**

- Power pellets, modo asustado, puntuación y combo.
- Fase `returning` y respawn de fantasmas comidos.
- Cambios de velocidad, roles, fases scatter/chase o túnel.
- Cambios visuales en `render.js` y HUD.
- Sonido, niveles, vidas extra y tests automáticos.

## Data model

Geometría en `maze.js`, que sigue siendo el único sitio con coordenadas del laberinto:

```js
// Interiores de la pen: columnas 11-16, filas 13-15.
// Se incluye la fila 12 (puerta) para descartar también objetivos en la puerta.
const PEN_AREA = { left: 11, right: 16, top: 12, bottom: 15 };
```

Estado de cada fantasma en `game.js`:

```js
{
  x, y, dir, speed, kind, releaseFrames,
  phase: 'waiting' | 'leaving' | 'roaming',
}
```

Convenciones:

- `waiting`: está dentro de la pen y `releaseFrames` baja de 1 en 1. No se mueve.
- `leaving`: está dentro y va a `PEN_EXIT`. Es el único estado que cruza la puerta.
- `roaming`: está en el laberinto y sigue las reglas actuales de scatter/chase.
- `phase` no se deriva de coordenadas. La fila de la puerta queda fuera del rango interior y una comprobación por posición devolvería al fantasma hacia dentro.
- `ghostActor( ghost )` devuelve `'penGhost'` si `phase === 'leaving'` y `'ghost'` en cualquier otro caso.
- `isWall` trata la celda `3` como muro para todos los actores excepto `'penGhost'`.

Contrato para la futura spec de power pellets:

- Añadir `'returning'` a la unión de `phase` y a `ghostActor`.
- `returning` usará como objetivo su celda de `GHOST_STARTS`, ignorará colisiones y no será comestible.
- No hará falta tocar `isWall` ni la geometría: la puerta ya será de tránsito.

## Comportamiento

- `createGame` y `resetPositions` inicializan `phase: 'waiting'` y `releaseFrames: index * GHOST_RELEASE_FRAMES`.
- En `update`, un `waiting` descuenta `releaseFrames` y, al llegar a 0, pasa a `leaving`. Después se mueve como hoy.
- En `decideGhost`, un `leaving` apunta a `PEN_EXIT`; al llegar, pasa a `roaming`. Un `roaming` conserva la lógica actual de rol y fase.
- Si un `roaming` aparece dentro de `PEN_AREA`, la guarda de recuperación lo pasa a `leaving` para que salga.
- `targetFor` sustituye por la celda actual de Pac-Man cualquier objetivo de un fantasma con objetivo que caiga dentro de `PEN_AREA`.
- `chooseDirection`, `forwardDirections` y `moveGhost` reciben el actor de `ghostActor`. `nextCell`, el túnel y el BFS no cambian.

## Implementation plan

1. **`maze.js`: geometría de la pen.** Añadir `PEN_AREA` y exportarlo. Manual: abrir `src/index.html`; no hay errores y el juego se comporta igual.
2. **`game.js`: ciclo de vida con `phase`.** Sustituir `leaving` en `createGame`, `resetPositions`, `update` y `decideGhost`. Manual: los cuatro fantasmas salen escalonados como antes.
3. **`game.js`: puerta de tránsito.** Añadir `ghostActor`, bloquear la celda `3` para `'ghost'` y pasar el actor por `chooseDirection`, `forwardDirections` y `moveGhost`. Manual: 30 s de partida sin que ningún fantasma reentre en la pen.
4. **`game.js`: objetivos y recuperación.** Añadir el descarte de objetivos dentro de `PEN_AREA` y la guarda que convierte en `leaving` a un `roaming` atrapado. Manual: el flanqueador no ronda la puerta y, si se fuerza un fantasma dentro, sale.
5. **`AGENTS.md`: convenciones.** Actualizar la nota de la puerta y documentar `phase` y la extensión `returning`. Manual: leer la sección y comprobar que no contradice el código.

## Acceptance criteria

- [ ] Al abrir `src/index.html` la consola no muestra errores.
- [ ] Los cuatro fantasmas salen de la pen de uno en uno con ~1,5 s de diferencia.
- [ ] Durante 30 s de partida ningún fantasma con `phase === 'roaming'` está dentro de `PEN_AREA`.
- [ ] El `wanderer` no entra en la pen en ninguna partida de 30 s.
- [ ] Un fantasma que llega a `PEN_EXIT` pasa a `roaming` y no vuelve a cruzar la puerta.
- [ ] Si el espejo del `flanker` o el adelanto del `ambusher` cae en la pen, el fantasma apunta a Pac-Man en lugar de rondar la puerta.
- [ ] Si se coloca a mano un `roaming` dentro de `PEN_AREA`, pasa a `leaving` y sale.
- [ ] Perder una vida devuelve a los cuatro a `waiting` y repite la salida escalonada.
- [ ] El túnel sigue funcionando y `nextCell` se comporta igual fuera de la puerta.
- [ ] Cambiar `GHOST_RELEASE_FRAMES` por `180` dobla el intervalo sin tocar nada más.
- [ ] No quedan referencias al estado `leaving` ni código de power pellets o `returning`.
- [ ] `AGENTS.md` describe la puerta como paso exclusivo de fantasmas en tránsito.

## Decisions

- **Sí:** `phase` como único estado de la pen. Con power pellets harán falta al menos `waiting`, `leaving`, `roaming` y `returning`; cuatro booleanos serían más frágiles.
- **Sí:** puerta de tránsito. Solo los fantasmas que salen o vuelven la cruzan; el resto ve un muro.
- **No:** cerrar la puerta para todos. Rompería el regreso de los ojos en la spec de power pellets.
- **No:** derivar `leaving` de la posición. La puerta `(13,12)` está fuera del rango de filas de la pen y la comprobación devolvería al fantasma hacia dentro.
- **Sí:** `PEN_AREA` en `maze.js`. La geometría ya vive ahí y `game.js` no debe hardcodear columnas y filas.
- **Sí:** sustituir un objetivo dentro de la pen por la celda de Pac-Man. Un objetivo inalcanzable no aporta nada y el `flanker` quedaría pegado a la puerta.
- **No:** recortar el espejo del `flanker` al borde exterior de la pen. Distorsiona el rol y no resuelve el caso de la puerta.
- **Sí:** guarda de recuperación. Si un cambio futuro vuelve a meter un `roaming` dentro, sale en vez de quedarse atrapado.
- **Sí:** actualizar `AGENTS.md`. Hoy afirma que la puerta no bloquea a los fantasmas y quedaría desactualizado.
- **No:** editar SPEC 01. Esta spec documenta la sustitución de `leaving` por `phase`; la anterior se conserva como registro.
- **No:** tocar `render.js`. El cambio no debe verse en pantalla.

## Risks

| Risk | Mitigation |
| --- | --- |
| Un `roaming` entra por un bug futuro | Guarda de recuperación: pasa a `leaving` y sale. |
| El `flanker` o el `ambusher` apuntan dentro de la pen | `targetFor` sustituye el objetivo por la celda de Pac-Man. |
| El `wanderer` entra al azar | La puerta solo es transitable para `'penGhost'`. |
| El refactor olvida `resetPositions` | Checklist de `createGame`, `resetPositions`, `update` y `decideGhost`; criterio de perder una vida. |
| Bloquear también la salida inicial | `leaving` usa `'penGhost'`; criterio de salida escalonada. |
| Power pellets futuras necesitan entrar | `'returning'` se añade a `ghostActor`; contrato documentado. |
| `render.js` aún espera `leaving` | No lo usa; solo `game.js` y el HUD leen el estado. |

## What is **not** in this spec

- Power pellets, modo asustado, combo y puntuación.
- Fase `returning`, ojos y respawn de fantasmas comidos.
- Cambios de velocidad, roles, fases o túnel.
- Render, HUD, sonido y niveles.
- Tests automáticos.

Cada uno de esos, si llega, va en su propia spec.
