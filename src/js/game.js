// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS, PEN_EXIT, PEN_AREA.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame
const FRIGHTENED_SPEED = 0.0625;      // 1/16 celda/frame; con 1/10 comparte retícula 1/80
const FRIGHTENED_FRAMES = 480;        // 8 s a 60 fps
const FRIGHTENED_FLASH_FRAMES = 120;  // últimos 2 s: los fantasmas parpadean
const POWER_PELLET_POINTS = 50;
const GHOST_RELEASE_FRAMES = 90; // 1,5 s a 60 fps entre salidas de la pen
const AMBUSH_LEAD = 4;           // celdas por delante que apunta el emboscador
const SCATTER_FRAMES = 420;      // 7 s a 60 fps dispersando
const CHASE_FRAMES = 1200;       // 20 s a 60 fps persiguiendo

// Esquina de dispersion de cada rol. `wanderer` la define pero la ignora.
const SCATTER_TARGETS = {
  chaser: { x: 26, y: 1 },
  ambusher: { x: 1, y: 1 },
  flanker: { x: 26, y: 29 },
  wanderer: { x: 1, y: 29 },
};

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  // Los power pellets cuentan como comestible para poder ganar la partida.
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    mode: 'scatter',
    modeFrames: SCATTER_FRAMES,
    frightenedFrames: 0, // 0 = sin susto; >0 = frames que quedan
    ghostCombo: 0,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    // El primer fantasma sale de inmediato; el resto espera su turno.
    ghosts: GHOST_STARTS.map( ( start, index ) => ( {
      x: start.x,
      y: start.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: start.kind,
      releaseFrames: index * GHOST_RELEASE_FRAMES,
      phase: 'waiting',
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman / ghost: bloqueados por pared (1) y puerta (3)
//   penGhost: fantasma que sale de la pen; ademas cruza la puerta (3)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 ) return actor !== 'penGhost';
  return false;
}

// Celda destino al avanzar desde (cellX,cellY), o null si esta bloqueada.
// Fuente unica de adyacencia: la comparten el movimiento y el BFS.
// Resuelve el wrap del tunel, asi que un vecino puede estar al otro lado.
function nextCell( grid, cellX, cellY, direction, actor ) {
  const step = DIRS[ direction ];
  if ( !step ) return null;
  const nextY = cellY + step.y;
  if ( nextY < 0 || nextY >= grid.length ) return null;
  const width = grid[ 0 ].length;
  let nextX = cellX + step.x;
  if ( nextY === TUNNEL_ROW ) nextX = ( nextX + width ) % width;
  if ( nextX < 0 || nextX >= width ) return null;
  if ( isWall( grid, nextX, nextY, actor ) ) return null;
  return { x: nextX, y: nextY };
}

// Puede el actor avanzar desde (cellX,cellY) en esa direccion?
function canMove( grid, cellX, cellY, direction, actor ) {
  return nextCell( grid, cellX, cellY, direction, actor ) !== null;
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

// Activa o reinicia el susto. Un segundo pellet durante el susto reinicia
// duración y combo, como en el arcade.
function startFrightened( game ) {
  game.frightenedFrames = FRIGHTENED_FRAMES;
  game.ghostCombo = 0;
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot o power pellet.
    const tile = grid[ p.y ][ p.x ];
    if ( tile === 2 || tile === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += tile === 4 ? POWER_PELLET_POINTS : 10;
      game.dotsRemaining--;
      if ( tile === 4 ) startFrightened( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

function cellKey( cellX, cellY ) {
  return cellX + ',' + cellY;
}

// Distancias en celdas desde cada celda transitable hasta target (BFS).
// Se busca desde el objetivo, asi cada fantasma solo tiene que bajar distancia.
function bfsDistances( grid, target, actor ) {
  const distances = new Map();
  if ( isWall( grid, target.x, target.y, actor ) ) return distances;

  distances.set( cellKey( target.x, target.y ), 0 );
  const queue = [ target ];
  for ( let index = 0; index < queue.length; index++ ) {
    const cell = queue[ index ];
    const cellDistance = distances.get( cellKey( cell.x, cell.y ) );
    for ( const direction of Object.keys( DIRS ) ) {
      const neighbour = nextCell( grid, cell.x, cell.y, direction, actor );
      if ( !neighbour ) continue;
      const key = cellKey( neighbour.x, neighbour.y );
      if ( distances.has( key ) ) continue;
      distances.set( key, cellDistance + 1 );
      queue.push( neighbour );
    }
  }
  return distances;
}

// Direcciones abiertas sin la vuelta atras. En un callejon se permite.
function forwardDirections( grid, cellX, cellY, facing, actor ) {
  const open = Object.keys( DIRS ).filter(
    ( direction ) => canMove( grid, cellX, cellY, direction, actor )
  );
  const forward = open.filter( ( direction ) => direction !== OPPOSITE[ facing ] );
  return forward.length ? forward : open;
}

// Actor para isWall: solo el fantasma en transito (leaving y, en la futura
// spec de power pellets, returning) puede cruzar la puerta de la pen.
function ghostActor( ghost ) {
  return ghost.phase === 'leaving' ? 'penGhost' : 'ghost';
}

// Elige la direccion que acerca a target. Con BFS se permite el giro de 180
// porque la distancia siempre decrece; el greedy conserva la regla de no girar.
function chooseDirection( game, ghost, target ) {
  const grid = game.grid;
  const actor = ghostActor( ghost );
  const distances = bfsDistances( grid, target, actor );
  const ghostDistance = distances.get( cellKey( ghost.x, ghost.y ) );

  if ( ghostDistance !== undefined ) {
    let bestDirection = ghost.dir;
    let bestDistance = ghostDistance;
    for ( const direction of Object.keys( DIRS ) ) {
      const neighbour = nextCell( grid, ghost.x, ghost.y, direction, actor );
      if ( !neighbour ) continue;
      const neighbourDistance = distances.get( cellKey( neighbour.x, neighbour.y ) );
      if ( neighbourDistance !== undefined && neighbourDistance < bestDistance ) {
        bestDistance = neighbourDistance;
        bestDirection = direction;
      }
    }
    return bestDirection;
  }

  // Objetivo en pared o inalcanzable: aproximacion por distancia Manhattan.
  const options = forwardDirections( grid, ghost.x, ghost.y, ghost.dir, actor );
  let bestDirection = options[ 0 ] || ghost.dir;
  let bestDistance = Infinity;
  for ( const direction of options ) {
    const neighbour = nextCell( grid, ghost.x, ghost.y, direction, actor );
    if ( !neighbour ) continue;
    const manhattan = Math.abs( neighbour.x - target.x ) + Math.abs( neighbour.y - target.y );
    if ( manhattan < bestDistance ) {
      bestDistance = manhattan;
      bestDirection = direction;
    }
  }
  return bestDirection;
}

// Una celda cae dentro de la pen, puerta incluida?
function isInsidePenArea( cell ) {
  return (
    cell.x >= PEN_AREA.left && cell.x <= PEN_AREA.right &&
    cell.y >= PEN_AREA.top && cell.y <= PEN_AREA.bottom
  );
}

// Mantiene un objetivo dentro de la rejilla.
function clampToGrid( grid, cell ) {
  const maxX = grid[ 0 ].length - 1;
  const maxY = grid.length - 1;
  return {
    x: Math.max( 0, Math.min( maxX, cell.x ) ),
    y: Math.max( 0, Math.min( maxY, cell.y ) ),
  };
}

// Objetivo de persecucion del rol. null = sin objetivo, deambula.
function chaseTarget( game, ghost ) {
  const pacman = game.pacman;
  const pacmanX = Math.round( pacman.x );
  const pacmanY = Math.round( pacman.y );

  switch ( ghost.kind ) {
    case 'chaser':
      return { x: pacmanX, y: pacmanY };
    case 'ambusher': {
      const heading = DIRS[ pacman.dir ];
      return clampToGrid( game.grid, {
        x: pacmanX + heading.x * AMBUSH_LEAD,
        y: pacmanY + heading.y * AMBUSH_LEAD,
      } );
    }
    case 'flanker':
      // Espejo de Pac-Man respecto al fantasma: busca el lado contrario.
      return clampToGrid( game.grid, {
        x: 2 * pacmanX - Math.round( ghost.x ),
        y: 2 * pacmanY - Math.round( ghost.y ),
      } );
  }
  return null;
}

// Objetivo segun rol y fase. `wanderer` nunca tiene objetivo.
function targetFor( game, ghost ) {
  if ( ghost.kind === 'wanderer' ) return null;
  const target =
    game.mode === 'scatter'
      ? SCATTER_TARGETS[ ghost.kind ] || null
      : chaseTarget( game, ghost );
  // La pen es inalcanzable para un fantasma roaming: un objetivo dentro
  // lo dejaria rondando la puerta.
  if ( target && isInsidePenArea( target ) ) {
    return { x: Math.round( game.pacman.x ), y: Math.round( game.pacman.y ) };
  }
  return target;
}

function decideGhost( game, ghost ) {
  // Guarda: un roaming dentro de la pen solo puede venir de un bug o de un
  // cambio futuro. Se fuerza la salida en vez de dejarlo atrapado.
  if ( ghost.phase === 'roaming' && isInsidePenArea( { x: ghost.x, y: ghost.y } ) ) {
    ghost.phase = 'leaving';
  }

  // Salir de la pen es una fase propia: la geometria de la caja solo tiene
  // una puerta y la logica de rol se quedaria atrapada dentro.
  if ( ghost.phase === 'leaving' ) {
    const atExit =
      Math.round( ghost.x ) === PEN_EXIT.x && Math.round( ghost.y ) === PEN_EXIT.y;
    if ( !atExit ) {
      ghost.dir = chooseDirection( game, ghost, PEN_EXIT );
      return;
    }
    ghost.phase = 'roaming';
  }

  const target = targetFor( game, ghost );
  if ( target ) {
    ghost.dir = chooseDirection( game, ghost, target );
    return;
  }

  // El errante deambula al azar en ambas fases.
  const options = forwardDirections( game.grid, ghost.x, ghost.y, ghost.dir, ghostActor( ghost ) );
  ghost.dir = options[ Math.floor( Math.random() * options.length ) ] || ghost.dir;
}

// Velocidad objetivo segun el susto. moveGhost la aplica al llegar a una
// celda entera; cambiarla a mitad de celda dejaria al fantasma sin alinear.
function ghostSpeed( game, ghost ) {
  if ( game.frightenedFrames > 0 && ghost.phase === 'roaming' ) return FRIGHTENED_SPEED;
  return GHOST_SPEED;
}

function moveGhost( game, ghost ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( ghost.x ) && aligned( ghost.y ) ) {
    ghost.x = Math.round( ghost.x );
    ghost.y = Math.round( ghost.y );
    // El cambio de velocidad solo se aplica en celda entera: 1/16 y 1/10 no
    // devuelven a un entero desde cualquier desplazamiento fraccionario.
    ghost.speed = ghostSpeed( game, ghost );
    decideGhost( game, ghost );
    // Se recalcula despues de decidir: al llegar a PEN_EXIT la fase cambia
    // de 'leaving' a 'roaming' y la puerta deja de ser transitable.
    if ( !canMove( grid, ghost.x, ghost.y, ghost.dir, ghostActor( ghost ) ) ) return;
  }

  const step = DIRS[ ghost.dir ];
  ghost.x += step.x * ghost.speed;
  ghost.y += step.y * ghost.speed;
  wrapTunnel( ghost, width );
}

function resetPositions( game ) {
  const pacman = game.pacman;
  // Al perder una vida se apaga el susto; si no, se encadenarían pellets.
  game.frightenedFrames = 0;
  game.ghostCombo = 0;
  pacman.x = PACMAN_START.x;
  pacman.y = PACMAN_START.y;
  pacman.dir = 'left';
  pacman.nextDir = null;
  game.ghosts.forEach( ( ghost, index ) => {
    ghost.x = GHOST_STARTS[ index ].x;
    ghost.y = GHOST_STARTS[ index ].y;
    ghost.dir = 'up';
    ghost.speed = GHOST_SPEED;
    ghost.releaseFrames = index * GHOST_RELEASE_FRAMES;
    ghost.phase = 'waiting';
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

// Alterna dispersion y persecucion cada SCATTER_FRAMES / CHASE_FRAMES.
function updateMode( game ) {
  game.modeFrames--;
  if ( game.modeFrames > 0 ) return;
  game.mode = game.mode === 'scatter' ? 'chase' : 'scatter';
  game.modeFrames = game.mode === 'scatter' ? SCATTER_FRAMES : CHASE_FRAMES;
}

function update( game ) {
  if ( game.frightenedFrames > 0 ) game.frightenedFrames--;
  movePacman( game );
  // El reloj de scatter/chase se congela mientras dura el susto.
  if ( game.frightenedFrames === 0 ) updateMode( game );

  for ( const ghost of game.ghosts ) {
    if ( ghost.phase === 'waiting' ) {
      if ( ghost.releaseFrames > 0 ) {
        ghost.releaseFrames--;
        continue;
      }
      ghost.phase = 'leaving';
    }
    moveGhost( game, ghost );
  }

  for ( const ghost of game.ghosts ) {
    if ( collides( game.pacman, ghost ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
