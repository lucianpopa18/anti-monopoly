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

function Die({ value, rollNonce, turnId, home }) {
  const ref = useRef();
  const mats = useMemo(() => FACE_VALUES.map(v => new THREE.MeshStandardMaterial({ map: makePipTexture(v), roughness: 0.4 })), []);
  const st = useRef({
    nonce: rollNonce, turn: turnId, phase: 'idle', start: 0,
    from: new THREE.Vector3(...home), land: new THREE.Vector3(...home),
    retFrom: new THREE.Vector3(...home), axis: new THREE.Vector3(1, 0, 0), spins: 6,
  });

  // aruncare → aterizează într-o poziție ALEATORIE pe tablă
  if (rollNonce !== st.current.nonce) {
    st.current.nonce = rollNonce; st.current.phase = 'rolling'; st.current.start = performance.now();
    st.current.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    st.current.spins = 5 + Math.floor(Math.random() * 4);
    const lx = (Math.random() - 0.5) * 8, lz = (Math.random() - 0.5) * 8;
    st.current.land.set(lx, home[1], lz);
    st.current.from.set(lx + (Math.random() - 0.5) * 2, home[1] + 5, lz + 3.5);
  }
  // schimbare tură → zarurile revin la mijloc (acasă)
  if (turnId !== st.current.turn) {
    st.current.turn = turnId;
    if (st.current.phase !== 'idle') {
      st.current.phase = 'returning'; st.current.start = performance.now();
      st.current.retFrom.copy(ref.current ? ref.current.position : st.current.land);
    }
  }

  useFrame(() => {
    const m = ref.current; if (!m) return;
    const tgt = targetQuat(value || 1); const s = st.current;

    if (s.phase === 'idle') { m.position.set(home[0], home[1], home[2]); m.quaternion.copy(tgt); return; }

    if (s.phase === 'rolling') {
      const T = Math.min(1, (performance.now() - s.start) / 1150), ease = 1 - Math.pow(1 - T, 3);
      const tumble = new THREE.Quaternion().setFromAxisAngle(s.axis, (1 - ease) * s.spins * Math.PI * 2);
      m.quaternion.copy(tgt).premultiply(tumble);
      const ox = s.from.x + (s.land.x - s.from.x) * ease, oz = s.from.z + (s.land.z - s.from.z) * ease;
      const bounce = Math.abs(Math.sin(T * Math.PI * 3)) * (1 - T) * 2.2;
      const drop = s.from.y + (s.land.y - s.from.y) * ease;
      m.position.set(ox, Math.max(s.land.y, drop) + bounce, oz);
      if (T >= 1) { s.phase = 'rest'; m.position.copy(s.land); }
      return;
    }
    if (s.phase === 'rest') { m.position.copy(s.land); m.quaternion.copy(tgt); return; }

    if (s.phase === 'returning') {
      const T = Math.min(1, (performance.now() - s.start) / 650), ease = 1 - Math.pow(1 - T, 3);
      m.position.set(
        s.retFrom.x + (home[0] - s.retFrom.x) * ease,
        s.retFrom.y + (home[1] - s.retFrom.y) * ease + Math.sin(T * Math.PI) * 0.6,
        s.retFrom.z + (home[2] - s.retFrom.z) * ease,
      );
      m.quaternion.copy(tgt);
      if (T >= 1) { s.phase = 'idle'; m.position.set(home[0], home[1], home[2]); }
      return;
    }
  });

  return (
    <mesh ref={ref} position={home} castShadow material={mats}>
      <boxGeometry args={[0.8, 0.8, 0.8]} />
    </mesh>
  );
}

function Dice3D({ dice, rollNonce, turnId }) {
  if (!dice) return null;
  return (
    <group>
      <Die value={dice[0]} rollNonce={rollNonce} turnId={turnId} home={[-0.9, 0.55, 0]} />
      <Die value={dice[1]} rollNonce={rollNonce} turnId={turnId} home={[0.9, 0.55, 0]} />
    </group>
  );
}

// Centrul tablei ca textură plată (ca pe tabla reală): alb, ramă de skyline negru,
// logo diagonal + două sloturi de cărți (Monopolist / Competitor).
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawSlot(g, cx, cy, rot, label, color) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.strokeStyle = color; g.lineWidth = 6; roundRect(g, -160, -100, 320, 200, 16); g.stroke();
  g.fillStyle = color; g.font = '800 42px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 0, 0);
  g.restore();
}
function makeCenterTexture() {
  const S = 1400;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, S, S);
  // ramă de skyline (siluetă neagră care intră spre centru din cele 4 laturi)
  g.fillStyle = '#131313';
  const step = 44; const rnd = (a, b) => a + Math.random() * (b - a);
  for (let x = 0; x < S; x += step) {
    const w = step - rnd(3, 9);
    g.fillRect(x, 0, w, rnd(55, 155));            // sus
    const hb = rnd(55, 155); g.fillRect(x, S - hb, w, hb); // jos
  }
  for (let y = 0; y < S; y += step) {
    const w = step - rnd(3, 9);
    g.fillRect(0, y, rnd(55, 155), w);            // stânga
    const hr = rnd(55, 155); g.fillRect(S - hr, y, hr, w); // dreapta
  }
  // logo diagonal
  const LOGO_ROT = -0.19;
  const cxc = S * 0.5, cyc = S * 0.5;
  g.save(); g.translate(cxc, cyc); g.rotate(LOGO_ROT);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#131313'; g.font = '900 120px Arial'; g.fillText('ANTI-MONOPOLY', 0, -14);
  g.fillStyle = '#8A6E4B'; g.font = '700 42px Arial'; g.fillText('Afaceri imobiliare · Jocul secolului 21', 0, 66);
  g.restore();
  // sloturi de cărți — simetrice de o parte și de alta a benzii logo, paralele cu ea
  const perp = LOGO_ROT + Math.PI / 2;
  const dist = S * 0.26;
  drawSlot(g, cxc - Math.cos(perp) * dist, cyc - Math.sin(perp) * dist, LOGO_ROT, 'MONOPOLIST', '#2E5BD8');
  drawSlot(g, cxc + Math.cos(perp) * dist, cyc + Math.sin(perp) * dist, LOGO_ROT, 'COMPETITOR', '#2E9E5B');
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}

function CenterPiece() {
  const tex = useMemo(() => makeCenterTexture(), []);
  const size = TILE * 9.35;
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} roughness={0.85} />
    </mesh>
  );
}

// ---------- DECOR: iarbă + cer + munți ----------
function makeGrassTexture() {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#3f8f45'; g.fillRect(0, 0, S, S);
  const shades = ['#4aa153', '#357a3b', '#47963f', '#57ab5c', '#2f7135'];
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = shades[(Math.random() * shades.length) | 0];
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(28, 28); return t;
}
function makeSkyTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4E8FD0'); grd.addColorStop(0.55, '#9CC9EC'); grd.addColorStop(1, '#DCEBF2');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  return new THREE.CanvasTexture(c);
}
function makeMountainTexture() {
  const W = 2048, H = 512; const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const range = (baseY, amp, step, color) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, H); g.lineTo(0, baseY);
    let x = 0; while (x < W) { x += step * (0.6 + Math.random() * 0.8); g.lineTo(x, baseY - Math.random() * amp); }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  range(H * 0.52, 140, 150, '#6D8296');  // munți în spate (mai deschiși = ceață)
  range(H * 0.66, 170, 120, '#51697F');  // munți în față
  range(H * 0.80, 90, 90, '#3C566B');    // dealuri aproape
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}

function Backdrop() {
  const sky = useMemo(() => makeSkyTexture(), []);
  const mts = useMemo(() => makeMountainTexture(), []);
  return (
    <group>
      <mesh>
        <sphereGeometry args={[320, 32, 16]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} fog={false} />
      </mesh>
      <mesh position={[0, 7, 0]}>
        <cylinderGeometry args={[150, 150, 60, 64, 1, true]} />
        <meshBasicMaterial map={mts} side={THREE.BackSide} transparent fog />
      </mesh>
    </group>
  );
}
function Ground() {
  const grass = useMemo(() => makeGrassTexture(), []);
  return (
    <mesh position={[0, -0.26, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial map={grass} roughness={1} metalness={0} />
    </mesh>
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
      const closePos = new THREE.Vector3(3, 7.5, 15), closeTgt = new THREE.Vector3(0, 0.4, 0);
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
        <color attach="background" args={['#9CC9EC']} />
        <fog attach="fog" args={['#CFE3EA', 90, 260]} />
        <PerspectiveCamera makeDefault position={[0, 20, 26]} fov={42} />
        <OrbitControls ref={controls} target={[0, 0, 0]} enablePan={false} minDistance={10} maxDistance={60}
          maxPolarAngle={1.4} minPolarAngle={0.15} enableDamping dampingFactor={0.08} />
        <CinematicDirector rollNonce={rollNonce} controls={controls} pawnPos={pawnPos} pawnMoving={pawnMoving}
          activeTile={game.players.find(p => p.id === game.turn)?.pos ?? 0} turnId={game.turn} />
        <Dice3D dice={dice} rollNonce={rollNonce} turnId={game.turn} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 22, 12]} intensity={1.4} castShadow
          shadow-mapSize-width={1024} shadow-mapSize-height={1024}
          shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />

        {/* decor: cer + munți + iarbă */}
        <Backdrop />
        <Ground />

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
