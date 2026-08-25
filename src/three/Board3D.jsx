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

      {/* highlight căsuța curentă — inel DEASUPRA blatului (nu sub el) */}
      {here && (
        <mesh position={[0, H / 2 + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[w * 0.36, w * 0.5, 40]} />
          <meshStandardMaterial color="#E0A82E" emissive="#E0A82E" emissiveIntensity={0.8}
            transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}

      {/* nume — la centru (colțul Închisoare are vizualul lui, împărțit pe diagonală) */}
      {!(corner && sq.kind === 'jail') && (
        <group position={[0, H / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, ry]}>
          <Text fontSize={corner ? 0.24 : 0.19} maxWidth={w * 0.86} textAlign="center"
            anchorX="center" anchorY="middle" color="#16181A" lineHeight={1}>
            {label}
          </Text>
        </group>
      )}
      {corner && sq.kind === 'jail' && <JailCorner w={w} x={x} z={z} ry={ry} />}
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

      {/* marcaj proprietar — STEAG în culoarea pionului, în fața căsuței (spre exterior) */}
      {owner && <Flag color={owner.color} out={OUT} w={w} />}
    </group>
  );
}

// Steag CULCAT pe sol (fără băț), întins în fața căsuței (spre exterior), în
// culoarea proprietarului; pânza unduiește ca și cum flutură pe jos.
function Flag({ color, out, w }) {
  const mesh = useRef();
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.52, 0.32, 12, 1);
    g.rotateX(-Math.PI / 2);   // culcat pe sol (normal în sus)
    g.translate(0, 0, -0.16);  // se întinde de la muchia exterioară spre interiorul căsuței
    return g;
  }, []);
  useFrame(({ clock }) => {
    const g = mesh.current?.geometry; if (!g) return;
    const t = clock.elapsedTime, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);                         // -0.32..0 (0 = muchia liberă, spre exterior)
      const fade = 1 + z / 0.32;                   // unduire mai mare spre muchia liberă
      p.setY(i, 0.03 + Math.sin(z * 11 + t * 4.5) * 0.03 * fade);
    }
    p.needsUpdate = true;
  });
  const rotY = Math.atan2(out[0], out[1]);
  const px = out[0] * (w / 2 - 0.03), pz = out[1] * (w / 2 - 0.03);
  return (
    <mesh ref={mesh} geometry={geo} position={[px, H / 2 + 0.01, pz]} rotation={[0, rotY, 0]} castShadow>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

const HOP = 0.5;         // înălțimea săriturii
const STEP_SPEED = 7;    // căsuțe pe secundă

const JUMP_H = 3.2;        // înălțimea săriturii de teleport (jail/start/carte)
const JUMP_DUR = 0.85;     // durata săriturii de teleport (secunde)

function Pawn({ player, offset, active, posRef, movingRef }) {
  const ref = useRef();
  // pos = poziție absolută „nedesfășurată" (float); end = ținta absolută
  // mode: 'walk' = pas cu pas înainte; 'jump' = teleport animat printr-un arc prin aer
  const anim = useRef({ pos: player.pos, end: player.pos, endTile: player.pos, jx: 0, jz: 0,
    mode: 'walk', jt: 1, jfrom: player.pos, jto: player.pos });

  // detectăm schimbarea de căsuță și construim traseul înainte
  if (player.pos !== anim.current.endTile) {
    const curTile = ((Math.round(anim.current.pos) % 40) + 40) % 40;
    const forward = (player.pos - curTile + 40) % 40;
    if (forward >= 1 && forward <= 12) {
      anim.current.mode = 'walk';
      anim.current.end = Math.round(anim.current.pos) + forward; // pas cu pas înainte
    } else {
      // teleport (închisoare / START / carte): în loc de salt sec, o săritură prin aer
      // spre destinație — camera o urmărește (efect cinematic), apoi aterizează.
      anim.current.mode = 'jump';
      anim.current.jt = 0;
      anim.current.jfrom = curTile;
      anim.current.jto = player.pos;
      anim.current.pos = player.pos; anim.current.end = player.pos; // poziția logică = destinația
    }
    anim.current.endTile = player.pos;
  }

  useFrame((_, delta) => {
    const a = anim.current;
    let x, z, y, moving;

    if (a.mode === 'jump' && a.jt < 1) {
      // săritură de teleport: arc lin de la căsuța curentă la destinație
      a.jt = Math.min(1, a.jt + delta / JUMP_DUR);
      const t = a.jt, ease = t * t * (3 - 2 * t); // smoothstep
      const pa = pos3(a.jfrom), pb = pos3(a.jto);
      x = pa.x + (pb.x - pa.x) * ease + offset[0];
      z = pa.z + (pb.z - pa.z) * ease + offset[1];
      y = H / 2 + Math.sin(t * Math.PI) * JUMP_H;
      a.jx = 0; a.jz = 0;
      moving = true;
    } else {
      if (a.pos < a.end) { a.pos = Math.min(a.end, a.pos + STEP_SPEED * delta); }
      const tileA = Math.floor(a.pos), frac = a.pos - tileA;
      const pa = pos3(((tileA % 40) + 40) % 40);
      const pb = pos3((((tileA + 1) % 40) + 40) % 40);
      moving = a.pos < a.end;
      // Pe colțul Închisoare (10), când e oprit: pionul stă pe jumătatea CORECTĂ —
      // spre colțul exterior dacă e închis, spre interior (centru) dacă e în vacanță.
      const settled = ((Math.round(a.pos) % 40) + 40) % 40;
      let tjx = 0, tjz = 0;
      if (!moving && settled === 10) {
        const p10 = pos3(10), sx = Math.sign(p10.x) || 1, sz = Math.sign(p10.z) || 1;
        const dir = player.inJail ? 1 : -1; // +1 = exterior (închisoare), -1 = interior (vacanță)
        tjx = dir * sx * 0.42; tjz = dir * sz * 0.42;
      }
      const k = Math.min(1, delta * 8); // tranziție lină spre jumătatea corectă
      a.jx += (tjx - a.jx) * k; a.jz += (tjz - a.jz) * k;
      x = pa.x + (pb.x - pa.x) * frac + offset[0] + a.jx;
      z = pa.z + (pb.z - pa.z) * frac + offset[1] + a.jz;
      y = H / 2 + (moving ? Math.sin(frac * Math.PI) * HOP : 0);
    }

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
    nonce: rollNonce, turn: turnId, phase: 'idle', start: 0, popStart: 0,
    from: new THREE.Vector3(...home), land: new THREE.Vector3(...home),
    retFrom: new THREE.Vector3(...home), axis: new THREE.Vector3(1, 0, 0), spins: 6,
  });

  // aruncare → aterizează într-o poziție ALEATORIE pe tablă (pereche ordonată lângă jucător)
  if (rollNonce !== st.current.nonce) {
    st.current.nonce = rollNonce; st.current.phase = 'rolling'; st.current.start = performance.now();
    st.current.popStart = 0;
    st.current.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    st.current.spins = 6 + Math.random() * 4; // fracționar → orientare de start aleatorie (nu pornește pe valoare)
    // aterizare pe ZONE separate (stânga/dreapta) ca cele două zaruri să nu se suprapună
    const zoneX = home[0] < 0 ? -0.85 : 0.85;
    const lx = zoneX + (Math.random() - 0.5) * 0.5, lz = (Math.random() - 0.5) * 1.0;
    st.current.land.set(lx, home[1], lz);
    st.current.from.set(lx + (Math.random() - 0.5) * 0.8, home[1] + 6, lz + 3);
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

    if (s.phase === 'idle') { m.position.set(home[0], home[1], home[2]); m.quaternion.copy(tgt); m.scale.setScalar(1); return; }

    if (s.phase === 'rolling') {
      // mai lent și mai fin: ~1.5s, rostogolire lină + 2-3 sărituri care se sting
      const T = Math.min(1, (performance.now() - s.start) / 1500);
      const ease = 1 - Math.pow(1 - T, 2.4);          // deplasare orizontală lină
      // rotație NATURALĂ: rapidă la început, încetinește lin până se oprește (frecare) — (1-T)^2.4
      const tumble = new THREE.Quaternion().setFromAxisAngle(s.axis, Math.pow(1 - T, 2.4) * s.spins * Math.PI * 2);
      m.quaternion.copy(tgt).premultiply(tumble);
      const ox = s.from.x + (s.land.x - s.from.x) * ease, oz = s.from.z + (s.land.z - s.from.z) * ease;
      const bounce = Math.abs(Math.sin(T * Math.PI * 2.4)) * Math.pow(1 - T, 1.4) * 1.9; // sărituri mai blânde
      const drop = s.from.y + (s.land.y - s.from.y) * (1 - Math.pow(1 - T, 3)); // cădere accelerată (gravitație)
      m.position.set(ox, Math.max(s.land.y, drop) + bounce, oz);
      // SQUASH & STRETCH: turtit la contact (bounce mic), ușor alungit în aer
      const squash = Math.max(0, 0.3 - bounce * 0.45);
      m.scale.set(1 + squash * 0.7, 1 - squash, 1 + squash * 0.7);
      if (T >= 1) { s.phase = 'rest'; s.popStart = performance.now(); m.position.copy(s.land); }
      return;
    }
    if (s.phase === 'rest') {
      m.position.copy(s.land); m.quaternion.copy(tgt);
      // POP la aterizare: crește scurt ~18% apoi revine (accent pe rezultat)
      const pt = Math.min(1, (performance.now() - s.popStart) / 260);
      const pop = Math.sin(pt * Math.PI) * 0.18;
      m.scale.setScalar(1 + pop);
      return;
    }

    if (s.phase === 'returning') {
      const T = Math.min(1, (performance.now() - s.start) / 650), ease = 1 - Math.pow(1 - T, 3);
      m.position.set(
        s.retFrom.x + (home[0] - s.retFrom.x) * ease,
        s.retFrom.y + (home[1] - s.retFrom.y) * ease + Math.sin(T * Math.PI) * 0.6,
        s.retFrom.z + (home[2] - s.retFrom.z) * ease,
      );
      m.quaternion.copy(tgt); m.scale.setScalar(1);
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

// Poziția 3D (x,z) a unui slot de carte, dedusă din geometria texturii centrale.
function cardSlotPos(sign) {
  const S = 1400, LOGO_ROT = -0.19, dist = S * 0.26, size = TILE * 9.35;
  const perp = LOGO_ROT + Math.PI / 2;
  const cx = S * 0.5 + sign * Math.cos(perp) * dist;
  const cy = S * 0.5 + sign * Math.sin(perp) * dist;
  return { x: (cx / S - 0.5) * size, z: (cy / S - 0.5) * size };
}

// Pachet de cărți pe tablă (teanc de cartonașe ALBE cu numele rolului scris pe
// spate, ca la cărțile reale). Cartea de sus se ridică când se trage o carte
// de rolul respectiv.
function CardDeck({ sign, color, label, myRole, seq, cardRole }) {
  const { x, z } = cardSlotPos(sign);
  const top = useRef();
  const lift = useRef(0);
  const seqRef = useRef(seq);
  useFrame((_, dt) => {
    if (seq !== seqRef.current) { seqRef.current = seq; if (cardRole === myRole) lift.current = 1; }
    const g = top.current; if (!g) return;
    if (lift.current > 0) {
      lift.current = Math.max(0, lift.current - dt * 0.9);
      const a = Math.sin((1 - lift.current) * Math.PI);
      g.position.y = 0.42 + a * 1.0;
      g.rotation.z = a * 0.28;
    } else { g.position.y = 0.42; g.rotation.z = 0; }
  });
  const N = 6;
  return (
    <group position={[x, 0.04, z]} rotation={[0, 0.19, 0]}>
      {Array.from({ length: N }).map((_, i) => (
        <RoundedBox key={i} args={[3.5, 0.06, 2.3]} radius={0.05} smoothness={2} position={[0, 0.06 + i * 0.06, 0]} castShadow>
          <meshStandardMaterial color="#FBF9F3" roughness={0.75} />
        </RoundedBox>
      ))}
      <group ref={top} position={[0, 0.42, 0]}>
        <RoundedBox args={[3.5, 0.08, 2.3]} radius={0.05} smoothness={2} castShadow>
          <meshStandardMaterial color="#FDFCF8" roughness={0.6} />
        </RoundedBox>
        {/* numele rolului scris pe spatele cărții de sus, culcat pe carte */}
        <Text position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.44}
          color={color} anchorX="center" anchorY="middle" maxWidth={3.2}
          depthOffset={-4} renderOrder={2}>
          {label}
        </Text>
      </group>
    </group>
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
const ORBIT_SPEED = 0.09; // rad/s — orbită lentă continuă în full screen (cinematic „viu")

// memorează parametrii unei orbite line în jurul țintei (folosit în idle, full screen)
function setupOrbit(s, camera, tgt) {
  s.orbitTgt.copy(tgt);
  const dx = camera.position.x - tgt.x, dz = camera.position.z - tgt.z;
  s.radius = Math.hypot(dx, dz);
  s.camY = camera.position.y;
  s.baseAngle = Math.atan2(dz, dx);
  s.idleT0 = performance.now();
}
// Vederea ideală pornind de la o poziție (x,z) în lume (nu doar de la o căsuță) —
// folosită atât pentru așezare, cât și pentru URMĂRIREA LINĂ a pionului în mișcare.
function idealViewXZ(x, z, immersive, out) {
  const len = Math.hypot(x, z) || 1;
  const dx = x / len, dz = z / len;
  const DIST = immersive ? 15 : 27, HEIGHT = immersive ? 9.5 : 16;
  const bias = immersive ? 0.98 : 0.12, ty = immersive ? 0.4 : 0;
  const o = out || { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  o.pos.set(dx * DIST, HEIGHT, dz * DIST);
  o.tgt.set(x * bias, ty, z * bias);
  return o;
}
function idealView(tile, immersive) {
  const { x, z } = pos3(tile);
  return idealViewXZ(x, z, immersive);
}

// Vedere de aruncare: zarurile cad în CENTRU (unde nu ating pachetele/căsuțele),
// dar camera vine JOS și APROAPE (unghi „hero") DINSPRE latura jucătorului curent
// + un mic jitter la fiecare aruncare → nu mai arată niciodată la fel.
function diceView(tileX, tileZ, angleOff, immersive, out) {
  const ang = Math.atan2(tileZ, tileX) + angleOff;
  const DIST = immersive ? 10 : 13, HEIGHT = immersive ? 4.8 : 6.2;
  const o = out || { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  o.pos.set(Math.cos(ang) * DIST, HEIGHT, Math.sin(ang) * DIST);
  o.tgt.set(0, 0.5, 0);
  return o;
}
// vectori temporari (evită alocări în bucla de randare)
const _tv1 = new THREE.Vector3(), _tv2 = new THREE.Vector3(), _tv3 = new THREE.Vector3();

// Regizor: init pe jucătorul curent · aruncare (picaj zaruri → urmărire pion) →
// se așază pe latura pionului · la schimbarea turei, glisează spre noul jucător.
function CinematicDirector({ rollNonce, controls, pawnPos, pawnMoving, activeTile, turnId, immersive }) {
  const { camera } = useThree();
  const P = useRef({ activeTile, turnId, immersive });
  P.current.activeTile = activeTile; P.current.turnId = turnId; P.current.immersive = immersive;
  const st = useRef({
    nonce: rollNonce, turn: turnId, phase: 'init', t0: 0, glideT0: 0, followT0: 0, stoppedAt: 0,
    fromPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toPos: new THREE.Vector3(), toTgt: new THREE.Vector3(),
    view: { pos: new THREE.Vector3(), tgt: new THREE.Vector3() },
    anchor: new THREE.Vector3(), diceAngle: 0,
    orbitTgt: new THREE.Vector3(), radius: 18, camY: 12, baseAngle: 0, idleT0: 0, orbitImmersive: false,
  });

  // trigger: aruncare → picaj scurt spre zaruri, apoi urmărire lină a pionului
  if (rollNonce !== st.current.nonce) {
    st.current.nonce = rollNonce;
    st.current.phase = 'dice'; st.current.t0 = performance.now(); st.current.stoppedAt = 0;
    st.current.fromPos.copy(camera.position);
    if (controls.current) { st.current.fromTgt.copy(controls.current.target); controls.current.enabled = false; }
    // îngheață poziția căsuței jucătorului (pt direcția camerei) + jitter de unghi la fiecare aruncare
    { const pp = pos3(P.current.activeTile); st.current.anchor.set(pp.x, 0, pp.z); }
    st.current.diceAngle = (Math.random() - 0.5) * 1.1;
  }
  // trigger: schimbare tură → glisare lină spre noul jucător (dacă nu suntem în aruncare)
  if (turnId !== st.current.turn) {
    st.current.turn = turnId;
    const s = st.current;
    if (s.phase === 'idle' || s.phase === 'init') {
      const v = idealView(P.current.activeTile, P.current.immersive);
      s.fromPos.copy(camera.position);
      s.fromTgt.copy(controls.current ? controls.current.target : v.tgt);
      s.toPos.copy(v.pos); s.toTgt.copy(v.tgt);
      s.glideT0 = performance.now(); s.phase = 'glide';
      if (controls.current) controls.current.enabled = false;
    }
  }

  // așază camera în idle (activează OrbitControls în normal / orbită lentă în full screen)
  const settleIdle = (s, tgt) => {
    if (P.current.immersive) { setupOrbit(s, camera, tgt); if (controls.current) controls.current.enabled = false; }
    else if (controls.current) { controls.current.enabled = true; controls.current.update?.(); }
    s.orbitImmersive = P.current.immersive;
    s.phase = 'idle';
  };

  useFrame((_, delta) => {
    const s = st.current, now = performance.now();
    const tgt = controls.current ? controls.current.target : new THREE.Vector3();

    if (s.phase === 'init') {
      const v = idealView(P.current.activeTile, P.current.immersive);
      camera.position.copy(v.pos); tgt.copy(v.tgt); camera.lookAt(tgt);
      settleIdle(s, tgt); return;
    }
    if (s.phase === 'idle') {
      if (P.current.immersive !== s.orbitImmersive) settleIdle(s, tgt);
      if (P.current.immersive) {
        const ang = s.baseAngle + ((now - s.idleT0) / 1000) * ORBIT_SPEED;
        camera.position.set(s.orbitTgt.x + Math.cos(ang) * s.radius, s.camY, s.orbitTgt.z + Math.sin(ang) * s.radius);
        camera.lookAt(s.orbitTgt);
      }
      return;
    }

    if (s.phase === 'dice') {
      // picaj „hero" spre zaruri (lângă jucător, unghi diferit de fiecare dată),
      // apoi IMPACT (mic zoom-punch + zguduire) când zarurile ating masa.
      const el = now - s.t0, IN = 480, LAND = 1500, MAX_HOLD = 2600;
      diceView(s.anchor.x, s.anchor.z, s.diceAngle, P.current.immersive, s.view);
      // impact: se stinge în ~320ms după aterizare
      let k = 0;
      if (el > LAND) k = Math.max(0, 1 - (el - LAND) / 320);
      // apropie camera de țintă la impact (zoom-punch)
      const camPos = _tv1.copy(s.view.pos).sub(s.view.tgt).multiplyScalar(1 - 0.13 * k * k).add(s.view.tgt);
      if (k > 0) camPos.add(_tv2.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(0.18 * k));
      if (el < IN) { const t = easeCubic(el / IN); camera.position.copy(s.fromPos).lerp(camPos, t); tgt.copy(s.fromTgt).lerp(s.view.tgt, t); }
      else { camera.position.copy(camPos); tgt.copy(s.view.tgt); }
      camera.lookAt(tgt);
      // trece la urmărire FIX când pornește pionul (sincron local+online) sau ca rezervă după MAX_HOLD
      if (el >= IN && (pawnMoving.current || el > MAX_HOLD)) { s.phase = 'follow'; s.followT0 = now; s.stoppedAt = 0; }
      return;
    }

    if (s.phase === 'follow') {
      // urmărire LINĂ: camera se așază pe latura pionului (aceeași încadrare ca la final),
      // ținta e la nivelul tablei (fără să tremure când pionul saltă).
      const p = pawnPos.current;
      idealViewXZ(p.x, p.z, P.current.immersive, s.view);
      const a = 1 - Math.exp(-4.5 * delta); // amortizare independentă de framerate
      camera.position.lerp(s.view.pos, a);
      tgt.lerp(s.view.tgt, a);
      camera.lookAt(tgt);
      // pionul s-a oprit → mai ține puțin, apoi așază exact pe căsuța finală
      if (!pawnMoving.current) { if (!s.stoppedAt) s.stoppedAt = now; }
      else s.stoppedAt = 0;
      if (s.stoppedAt && now - s.stoppedAt > 320 && now - s.followT0 > 260) {
        const v = idealView(P.current.activeTile, P.current.immersive);
        camera.position.copy(v.pos); tgt.copy(v.tgt); camera.lookAt(tgt);
        settleIdle(s, tgt);
      }
      return;
    }

    if (s.phase === 'glide') {
      const t = easeCubic(Math.min(1, (now - s.glideT0) / 800));
      camera.position.copy(s.fromPos).lerp(s.toPos, t);
      tgt.copy(s.fromTgt).lerp(s.toTgt, t);
      camera.lookAt(tgt);
      if (t >= 1) { camera.position.copy(s.toPos); tgt.copy(s.toTgt); settleIdle(s, tgt); }
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
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          // Pe mobil GPU-ul poate „pierde" contextul WebGL (memorie/economisire) → altfel
          // canvas-ul rămâne alb definitiv. preventDefault îi cere browserului să-l restaureze,
          // iar r3f re-randează automat la 'webglcontextrestored'.
          gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
        }}>
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
        <CardDeck sign={-1} color="#2E5BD8" label="Monopolist" myRole="monopolist" seq={game.lastCard?.seq || 0} cardRole={game.lastCard?.role} />
        <CardDeck sign={1} color="#2E9E5B" label="Competitor" myRole="competitor" seq={game.lastCard?.seq || 0} cardRole={game.lastCard?.role} />
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

// Colțul „Închisoare" — pătratul e împărțit pe diagonală: triunghiul EXTERIOR
// (spre colțul tablei) = închisoare; triunghiul INTERIOR (spre centru) = vacanță.
// Pici aici din zar = doar vizită (vezi engine.resolveLanding); la închisoare
// ajungi doar de pe „La Închisoare" (căsuța 30) sau dintr-un cartonaș.
function triGeo(pts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.computeVertexNormals();
  return g;
}
function JailCorner({ w, x, z, ry }) {
  const sx = Math.sign(x) || 1, sz = Math.sign(z) || 1;
  const h = w / 2;
  const y = H / 2 + 0.006;
  // colț exterior = (sx,sz); colț interior = (-sx,-sz); linia diag. leagă celelalte două colțuri.
  const geoJail = useMemo(() => triGeo([sx * h, y, sz * h, sx * h, y, -sz * h, -sx * h, y, sz * h]), [w, sx, sz]);
  const geoVac = useMemo(() => triGeo([-sx * h, y, -sz * h, -sx * h, y, sz * h, sx * h, y, -sz * h]), [w, sx, sz]);
  const dx = 2 * sx * h, dz = -2 * sz * h;
  const lineLen = Math.hypot(dx, dz) * 0.98;
  const lineRotY = -Math.atan2(dz, dx);
  return (
    <group>
      <mesh geometry={geoJail}><meshBasicMaterial color="#E8933B" toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={geoVac}><meshBasicMaterial color="#63C08A" toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, H / 2 + 0.009, 0]} rotation={[0, lineRotY, 0]}>
        <boxGeometry args={[lineLen, 0.03, 0.055]} />
        <meshBasicMaterial color="#16181A" toneMapped={false} />
      </mesh>
      <group position={[sx * w / 6, H / 2 + 0.02, sz * w / 6]} rotation={[-Math.PI / 2, 0, ry]}>
        <Text fontSize={0.155} maxWidth={w * 0.5} textAlign="center" anchorX="center" anchorY="middle" color="#16181A" lineHeight={1}>ÎNCHISOARE</Text>
      </group>
      <group position={[-sx * w / 6, H / 2 + 0.02, -sz * w / 6]} rotation={[-Math.PI / 2, 0, ry]}>
        <Text fontSize={0.155} maxWidth={w * 0.5} textAlign="center" anchorX="center" anchorY="middle" color="#16181A" lineHeight={1}>VACANȚĂ</Text>
      </group>
    </group>
  );
}
