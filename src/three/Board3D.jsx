import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, RoundedBox } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
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
  if (side === 'left') return -Math.PI / 2; // citibil din exterior (stânga)
  return Math.PI / 2; // right — citibil din exterior
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
  // OUT = direcția spre EXTERIORUL tablei; bara stă pe muchia interioară, prețul spre exterior.
  const { side } = gridPos(i);
  const OUT = ({ bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] })[side] || [0, 1];
  const edge = w / 2 - 0.13;
  const barGeo = (side === 'left' || side === 'right') ? [0.42, 0.06, w] : [w, 0.06, 0.42];
  const along = (side === 'left' || side === 'right');
  const nBuild = game.buildings?.[i] || 0;

  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[w, H, w]} radius={0.05} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color={corner ? '#F2F1EC' : '#FFFFFF'} roughness={0.75} metalness={0.02} />
      </RoundedBox>

      {/* bară colorată de grup, pe muchia INTERIOARĂ (spre centru) */}
      {group && (
        <mesh position={[-OUT[0] * edge, H / 2 + 0.005, -OUT[1] * edge]}>
          <boxGeometry args={barGeo} />
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

      {/* nume — la centru */}
      <group position={[0, H / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, ry]}>
        <Text fontSize={corner ? 0.24 : 0.19} maxWidth={w * 0.86} textAlign="center"
          anchorX="center" anchorY="middle" color="#16181A" lineHeight={1}>
          {label}
        </Text>
      </group>
      {/* preț — spre muchia EXTERIOARĂ (departe de bară) */}
      {price && (
        <group position={[OUT[0] * (w * 0.32), H / 2 + 0.02, OUT[1] * (w * 0.32)]} rotation={[-Math.PI / 2, 0, ry]}>
          <Text fontSize={0.185} anchorX="center" anchorY="middle" color="#333">{price}</Text>
        </group>
      )}

      {/* case (clădiri) — pe muchia interioară, lângă bară */}
      {nBuild > 0 && (
        <group position={[-OUT[0] * (w * 0.3), H / 2, -OUT[1] * (w * 0.3)]}>
          {Array.from({ length: nBuild }).map((_, k) => {
            const a = (k - (nBuild - 1) / 2) * 0.34;
            return (
              <mesh key={k} position={[along ? 0 : a, 0.13, along ? a : 0]} castShadow>
                <boxGeometry args={[0.24, 0.24, 0.24]} />
                <meshStandardMaterial color={owner?.role === 'monopolist' ? '#C0392B' : '#2E9E5B'} />
              </mesh>
            );
          })}
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

const HOP = 0.5;         // înălțimea săriturii
const STEP_SPEED = 7;    // căsuțe pe secundă

function Pawn({ player, offset, active, posRef, movingRef }) {
  const ref = useRef();
  // pos = poziție absolută „nedesfășurată" (float); end = ținta absolută
  const anim = useRef({ pos: player.pos, end: player.pos, endTile: player.pos });

  // detectăm schimbarea de căsuță și construim traseul înainte
  if (player.pos !== anim.current.endTile) {
    const curTile = ((Math.round(anim.current.pos) % 40) + 40) % 40;
    const forward = (player.pos - curTile + 40) % 40;
    if (forward >= 1 && forward <= 12) {
      anim.current.end = Math.round(anim.current.pos) + forward; // pas cu pas înainte
    } else {
      anim.current.pos = player.pos; anim.current.end = player.pos; // teleport (jail/carte) → direct
    }
    anim.current.endTile = player.pos;
  }

  useFrame((_, delta) => {
    const a = anim.current;
    if (a.pos < a.end) { a.pos = Math.min(a.end, a.pos + STEP_SPEED * delta); }
    const tileA = Math.floor(a.pos), frac = a.pos - tileA;
    const pa = pos3(((tileA % 40) + 40) % 40);
    const pb = pos3((((tileA + 1) % 40) + 40) % 40);
    const moving = a.pos < a.end;
    const x = pa.x + (pb.x - pa.x) * frac + offset[0];
    const z = pa.z + (pb.z - pa.z) * frac + offset[1];
    const y = H / 2 + (moving ? Math.sin(frac * Math.PI) * HOP : 0);
    if (ref.current) ref.current.position.set(x, y, z);
    if (active && posRef) posRef.current.set(x, y, z);
    if (active && movingRef) movingRef.current = moving;
  });

  return (
    <group ref={ref}>
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

// ---------- ZARURI 3D ----------
function makePipTexture(value) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#FBFAF7'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#16181A';
  const P = {
    1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[36, 36], [64, 64], [92, 92]],
    4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]],
    6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
  }[value];
  P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// valori pe fețe: [+x,-x,+y,-y,+z,-z] = [3,4,1,6,2,5]
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const TARGET_EULER = {
  1: [0, 0, 0], 2: [-Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2], 5: [Math.PI / 2, 0, 0], 6: [Math.PI, 0, 0],
};
const targetQuat = (v) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...TARGET_EULER[v]));

function Die({ value, rollNonce, origin }) {
  const ref = useRef();
  const mats = useMemo(() => FACE_VALUES.map(v => new THREE.MeshStandardMaterial({ map: makePipTexture(v), roughness: 0.4 })), []);
  const st = useRef({ nonce: rollNonce, start: -1, axis: new THREE.Vector3(1, 0, 0), spins: 0 });

  if (rollNonce !== st.current.nonce) {
    st.current.nonce = rollNonce;
    st.current.start = performance.now();
    st.current.axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    st.current.spins = 5 + Math.floor(Math.random() * 4);
    // punct de „aruncare" (mai sus și mai spre cameră), de unde cade spre origin
    st.current.from = new THREE.Vector3(origin[0] + (Math.random() - 0.5) * 2, origin[1] + 5, origin[2] + 3.5);
  }

  useFrame(() => {
    const m = ref.current; if (!m) return;
    const tgt = targetQuat(value || 1);
    const s = st.current;
    if (s.start < 0) { m.quaternion.copy(tgt); m.position.set(origin[0], origin[1], origin[2]); return; }
    const dur = 1150;
    const T = Math.min(1, (performance.now() - s.start) / dur);
    const ease = 1 - Math.pow(1 - T, 3);
    // rotire (tumble) care se stinge → aterizează exact pe valoare
    const tumbleAngle = (1 - ease) * s.spins * Math.PI * 2;
    const tumble = new THREE.Quaternion().setFromAxisAngle(s.axis, tumbleAngle);
    m.quaternion.copy(tgt).premultiply(tumble);
    // traiectorie: din punctul de aruncare spre origin, cu 3 sărituri care scad
    const ox = s.from.x + (origin[0] - s.from.x) * ease;
    const oz = s.from.z + (origin[2] - s.from.z) * ease;
    const bounce = Math.abs(Math.sin(T * Math.PI * 3)) * (1 - T) * 2.2;
    const drop = s.from.y + (origin[1] - s.from.y) * ease;
    m.position.set(ox, Math.max(origin[1], drop) + bounce, oz);
    if (T >= 1) s.start = -1;
  });

  return (
    <mesh ref={ref} position={origin} castShadow material={mats}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
    </mesh>
  );
}

function Dice3D({ dice, rollNonce }) {
  if (!dice) return null;
  return (
    <group>
      <Die value={dice[0]} rollNonce={rollNonce} origin={[-0.9, 0.55, 3.2]} />
      <Die value={dice[1]} rollNonce={rollNonce} origin={[0.9, 0.55, 3.2]} />
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

// Vederea „ideală" a unui pion: camera pe LATURA lui, privind peste tablă,
// astfel încât pionul activ e cel mai aproape de cameră (latura lui în față).
const easeCubic = (t) => 1 - Math.pow(1 - t, 3);
const CHASE_OFFSET = new THREE.Vector3(3.5, 5.2, 7);
function idealView(tile) {
  const { x, z } = pos3(tile);
  const len = Math.hypot(x, z) || 1;
  const dx = x / len, dz = z / len;
  const DIST = 27, HEIGHT = 16;
  return { pos: new THREE.Vector3(dx * DIST, HEIGHT, dz * DIST), tgt: new THREE.Vector3(x * 0.12, 0, z * 0.12) };
}

// Regizor: init pe jucătorul curent · aruncare (picaj zaruri → urmărire pion) →
// se așază pe latura pionului · la schimbarea turei, glisează spre noul jucător.
function CinematicDirector({ rollNonce, controls, pawnPos, pawnMoving, activeTile, turnId }) {
  const { camera } = useThree();
  const P = useRef({ activeTile, turnId });
  P.current.activeTile = activeTile; P.current.turnId = turnId;
  const st = useRef({
    nonce: rollNonce, turn: turnId, phase: 'init', t0: 0, trackT0: 0, moveT0: 0,
    fromPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toPos: new THREE.Vector3(), toTgt: new THREE.Vector3(),
  });

  // trigger: aruncare
  if (rollNonce !== st.current.nonce) {
    st.current.nonce = rollNonce;
    st.current.phase = 'dice'; st.current.t0 = performance.now();
    st.current.fromPos.copy(camera.position);
    if (controls.current) { st.current.fromTgt.copy(controls.current.target); controls.current.enabled = false; }
  }
  // trigger: schimbare tură (doar dacă nu suntem în mijlocul unei aruncări)
  if (turnId !== st.current.turn) {
    st.current.turn = turnId;
    if (st.current.phase === 'idle' || st.current.phase === 'init') st.current.phase = 'startMove';
  }

  useFrame(() => {
    const s = st.current, now = performance.now();
    const tgt = controls.current ? controls.current.target : new THREE.Vector3();

    if (s.phase === 'init') {
      const v = idealView(P.current.activeTile);
      camera.position.copy(v.pos); tgt.copy(v.tgt); camera.lookAt(tgt);
      if (controls.current) { controls.current.enabled = true; controls.current.update?.(); }
      s.phase = 'idle'; return;
    }
    if (s.phase === 'idle') return;

    if (s.phase === 'dice') {
      const el = now - s.t0, IN = 340, HOLD_END = 1150;
      const closePos = new THREE.Vector3(2.6, 2.8, 8.6), closeTgt = new THREE.Vector3(0, 0.6, 3.2);
      if (el < IN) { const t = easeCubic(el / IN); camera.position.copy(s.fromPos).lerp(closePos, t); tgt.copy(s.fromTgt).lerp(closeTgt, t); }
      else if (el < HOLD_END) { camera.position.copy(closePos); tgt.copy(closeTgt); }
      else { s.phase = 'track'; s.trackT0 = now; }
      camera.lookAt(tgt); return;
    }

    if (s.phase === 'track') {
      const p = pawnPos.current;
      camera.position.lerp(p.clone().add(CHASE_OFFSET), 0.09);
      tgt.lerp(p, 0.14); camera.lookAt(tgt);
      if (!pawnMoving.current && now - s.trackT0 > 500) s.phase = 'startMove';
      return;
    }

    if (s.phase === 'startMove') {
      const v = idealView(P.current.activeTile);
      s.fromPos.copy(camera.position); s.fromTgt.copy(tgt);
      s.toPos.copy(v.pos); s.toTgt.copy(v.tgt);
      s.moveT0 = now; s.phase = 'move';
      if (controls.current) controls.current.enabled = false;
      return;
    }

    if (s.phase === 'move') {
      const t = easeCubic(Math.min(1, (now - s.moveT0) / 850));
      camera.position.copy(s.fromPos).lerp(s.toPos, t);
      tgt.copy(s.fromTgt).lerp(s.toTgt, t);
      camera.lookAt(tgt);
      if (t >= 1) { camera.position.copy(s.toPos); tgt.copy(s.toTgt); if (controls.current) { controls.current.enabled = true; controls.current.update?.(); } s.phase = 'idle'; }
    }
  });
  return null;
}

export default function Board3D({ game, dice, rollNonce }) {
  const controls = useRef();
  const pawnPos = useRef(new THREE.Vector3());
  const pawnMoving = useRef(false);
  const players = game.players.filter(p => !p.bankrupt);
  const slotOffset = (idx, n) => {
    const ring = 0.34;
    const ang = (idx / Math.max(1, n)) * Math.PI * 2;
    return [Math.cos(ang) * ring, Math.sin(ang) * ring];
  };

  return (
    <div className="canvas3d">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#E7E6E1']} />
        <PerspectiveCamera makeDefault position={[0, 20, 26]} fov={42} />
        <OrbitControls ref={controls} target={[0, 0, 0]} enablePan={false} minDistance={10} maxDistance={60}
          maxPolarAngle={1.4} minPolarAngle={0.15} enableDamping dampingFactor={0.08} />
        <CinematicDirector rollNonce={rollNonce} controls={controls} pawnPos={pawnPos} pawnMoving={pawnMoving}
          activeTile={game.players.find(p => p.id === game.turn)?.pos ?? 0} turnId={game.turn} />
        <Dice3D dice={dice} rollNonce={rollNonce} />
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
        {players.map((p, i) => (
          <Pawn key={p.id} player={p} offset={slotOffset(i, players.length)}
            active={p.id === game.turn} posRef={pawnPos} movingRef={pawnMoving} />
        ))}
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
