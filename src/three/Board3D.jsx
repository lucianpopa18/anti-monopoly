import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, RoundedBox } from '@react-three/drei';
import { useMemo } from 'react';
import { BOARD, GROUPS } from '../game/board.js';
import { gridPos, isCorner } from '../game/layout.js';

const TILE = 2;          // mărimea unei căsuțe (mai mare = text mai lizibil)
const GAP = 0.06;
const H = 0.32;          // înălțimea căsuței
const half = 6;          // centrul grilei 11×11

// poziția 3D (x,z) a unei căsuțe din indexul 0..39
function pos3(index) {
  const { row, col } = gridPos(index);
  return { x: (col - half) * TILE, z: (row - half) * TILE };
}
// orientarea textului pe fiecare latură (să fie citibil dinspre exterior)
function textRotY(index) {
  const { side } = gridPos(index);
  if (side === 'bottom') return 0;
  if (side === 'top') return Math.PI;
  if (side === 'left') return Math.PI / 2;
  return -Math.PI / 2; // right
}

function Tile({ i, game }) {
  const sq = BOARD[i];
  const { x, z } = pos3(i);
  const corner = isCorner(i);
  const group = sq.type === 'property' ? GROUPS[sq.group] : null;
  const owner = game.players.find(p => p.id === game.ownership?.[i]);
  const here = game.players.find(p => p.id === game.turn)?.pos === i;
  const ry = textRotY(i);
  const w = TILE - GAP;

  const label = corner ? cornerShort(sq) : sq.name;
  const price = 'price' in sq ? `€${sq.price}` : '';

  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[w, H, w]} radius={0.05} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color={corner ? '#F2F1EC' : '#FFFFFF'} roughness={0.75} metalness={0.02} />
      </RoundedBox>

      {/* bară colorată de grup, pe muchia exterioară */}
      {group && (
        <mesh position={[0, H / 2 + 0.005, -w / 2 + 0.28]}>
          <boxGeometry args={[w, 0.06, 0.5]} />
          <meshStandardMaterial color={group.color} />
        </mesh>
      )}

      {/* highlight căsuța curentă */}
      {here && (
        <mesh position={[0, H / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[w * 0.52, w * 0.6, 32]} />
          <meshStandardMaterial color="#E0A82E" emissive="#E0A82E" emissiveIntensity={0.6} />
        </mesh>
      )}

      {/* etichetă */}
      <group position={[0, H / 2 + 0.02, group ? 0.18 : 0]} rotation={[-Math.PI / 2, 0, ry]}>
        <Text fontSize={corner ? 0.24 : 0.2} maxWidth={w * 0.92} textAlign="center"
          anchorX="center" anchorY="middle" color="#16181A" font={undefined} lineHeight={1}>
          {label}
        </Text>
        {price && (
          <Text position={[0, -w * 0.34, 0]} fontSize={0.19} anchorX="center" anchorY="middle" color="#333">
            {price}
          </Text>
        )}
      </group>

      {/* case (clădiri) */}
      {(game.buildings?.[i] || 0) > 0 && (
        <group position={[0, H / 2, -w / 2 + 0.62]}>
          {Array.from({ length: game.buildings[i] }).map((_, k) => (
            <mesh key={k} position={[(k - (game.buildings[i] - 1) / 2) * 0.36, 0.13, 0]} castShadow>
              <boxGeometry args={[0.26, 0.26, 0.26]} />
              <meshStandardMaterial color={owner?.role === 'monopolist' ? '#C0392B' : '#2E9E5B'} />
            </mesh>
          ))}
        </group>
      )}

      {/* marcaj proprietar */}
      {owner && (
        <mesh position={[w / 2 - 0.16, H / 2 + 0.02, w / 2 - 0.16]}>
          <cylinderGeometry args={[0.1, 0.1, 0.06, 16]} />
          <meshStandardMaterial color={owner.color} />
        </mesh>
      )}
    </group>
  );
}

function Pawn({ player, offset }) {
  const { x, z } = pos3(player.pos);
  return (
    <group position={[x + offset[0], H / 2, z + offset[1]]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.22, 0.36, 20]} />
        <meshStandardMaterial color={player.color} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <sphereGeometry args={[0.16, 20, 20]} />
        <meshStandardMaterial color={player.color} roughness={0.35} metalness={0.1} />
      </mesh>
    </group>
  );
}

function CenterPiece() {
  // skyline 3D discret + logo, pe fundal deschis
  const buildings = useMemo(() => ([
    [-4, 1.0, -2, 0.85], [-2.6, 1.7, -1.2, 0.75], [-1.2, 1.2, -2.2, 0.75], [0.2, 2.3, -1.4, 0.85],
    [1.6, 1.5, -2.3, 0.75], [3, 1.9, -1.3, 0.75], [4.2, 1.05, -2.1, 0.85], [-3.2, 1.25, 0.2, 0.7],
  ]), []);
  return (
    <group position={[0, 0.01, 0]}>
      {buildings.map((b, k) => (
        <mesh key={k} position={[b[0], b[1] / 2, b[2]]} castShadow>
          <boxGeometry args={[b[3], b[1], b[3]]} />
          <meshStandardMaterial color="#3A424C" roughness={0.6} />
        </mesh>
      ))}
      <Text position={[0, 0.03, 1.4]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1.0}
        anchorX="center" anchorY="middle" color="#16181A" letterSpacing={-0.02}>
        ANTI-MONOPOLY
      </Text>
      <Text position={[0, 0.03, 2.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.34}
        anchorX="center" anchorY="middle" color="#8A6E4B">
        Afaceri imobiliare · Jocul secolului 21
      </Text>
    </group>
  );
}

export default function Board3D({ game }) {
  const tokensByTile = {};
  game.players.filter(p => !p.bankrupt).forEach(p => { (tokensByTile[p.pos] = tokensByTile[p.pos] || []).push(p); });

  return (
    <div className="canvas3d">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#E7E6E1']} />
        <PerspectiveCamera makeDefault position={[0, 20, 26]} fov={42} />
        <OrbitControls target={[0, 0, 0]} enablePan={false} minDistance={10} maxDistance={60}
          maxPolarAngle={1.4} minPolarAngle={0.15} enableDamping dampingFactor={0.08} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 22, 12]} intensity={1.4} castShadow
          shadow-mapSize-width={1024} shadow-mapSize-height={1024}
          shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />

        {/* suprafața centrală deschisă (sub blaturile căsuțelor) */}
        <mesh position={[0, -0.18, 0]} receiveShadow>
          <boxGeometry args={[TILE * 11.4, 0.34, TILE * 11.4]} />
          <meshStandardMaterial color="#F1EEE6" roughness={0.9} />
        </mesh>
        {/* ramă subțire închisă */}
        <mesh position={[0, -0.22, 0]}>
          <boxGeometry args={[TILE * 11.75, 0.34, TILE * 11.75]} />
          <meshStandardMaterial color="#16181A" roughness={0.8} />
        </mesh>

        <CenterPiece />
        {BOARD.map((_, i) => <Tile key={i} i={i} game={game} />)}
        {game.players.filter(p => !p.bankrupt).map(p => {
          const mates = tokensByTile[p.pos] || [];
          const idx = mates.indexOf(p);
          const n = mates.length;
          const spread = 0.34;
          const ox = (idx - (n - 1) / 2) * spread;
          return <Pawn key={p.id} player={p} offset={[ox, 0.2]} />;
        })}
      </Canvas>
    </div>
  );
}

function cornerShort(sq) {
  if (sq.kind === 'start') return 'START';
  if (sq.kind === 'jail') return 'ÎNCHISOARE';
  if (sq.kind === 'fundatia') return 'FUNDAȚIA';
  if (sq.kind === 'gotojail') return 'LA ÎNCHISOARE';
  return sq.name;
}
