// ================= ANTI-MONOPOLY · MOTORUL =================
// Mașină de stare PURĂ, agnostică de UI. Toate acțiunile primesc starea și
// întorc o stare NOUĂ (imutabil) — ușor de sincronizat online (o gazdă aplică
// acțiunea, trimite starea rezultată tuturor). Randomul zarului se poate injecta
// (pentru teste + pentru „gazda aruncă, ceilalți văd").

import { BOARD, START, JAIL, GOTOJAIL, FUNDATIA, groupIndexes, GROUP_SIZE } from './board.js';

export const START_MONEY = 1500;
export const PASS_START = 100;   // trecere peste START
export const LAND_START = 200;   // aterizare fix pe START

const PLAYER_COLORS = {
  competitor: '#2E9E5B', // verde
  monopolist: '#3B6FE0', // albastru
};

// ---------- utilitare ----------
export function clone(state) {
  return JSON.parse(JSON.stringify(state));
}
function log(state, text) {
  state.log = state.log || [];
  state.log.push({ t: Date.now(), text });
  if (state.log.length > 200) state.log = state.log.slice(-200);
}
export function currentPlayer(state) {
  return state.players.find(p => p.id === state.turn) || null;
}
export function ownerOf(state, idx) {
  const pid = state.ownership?.[idx];
  return pid ? state.players.find(p => p.id === pid) : null;
}
export function ownsWholeGroup(state, playerId, group) {
  const idxs = groupIndexes(group);
  return idxs.every(i => state.ownership?.[i] === playerId);
}

// ---------- creare / lobby ----------
export function createGame({ code, hostName, hostRole = 'competitor', mode = 'classic' }) {
  const host = makePlayer(hostName, hostRole);
  return {
    code: code || randomCode(),
    mode,                     // 'classic' | 'short'
    status: 'lobby',
    players: [host],
    hostId: host.id,
    ownership: {},
    buildings: {},
    mortgaged: {},
    turn: null,
    dice: null,
    doublesCount: 0,
    pending: null,            // { type: 'buy', idx } etc.
    winnerId: null,
    log: [{ t: Date.now(), text: `${hostName} a creat camera.` }],
  };
}

export function makePlayer(name, role = 'competitor') {
  return {
    id: `p_${Math.random().toString(36).slice(2, 9)}`,
    name: String(name || 'Jucător').slice(0, 20),
    role,                       // 'competitor' | 'monopolist'
    color: PLAYER_COLORS[role],
    pos: START,
    money: START_MONEY,
    inJail: false,
    jailTurns: 0,
    getOutFree: 0,
    bankrupt: false,
  };
}

export function addPlayer(state, name, role) {
  const s = clone(state);
  if (s.status !== 'lobby') return s;
  if (s.players.length >= 6) return s;
  const p = makePlayer(name, role || suggestRole(s));
  s.players.push(p);
  log(s, `${p.name} s-a alăturat (${p.role === 'competitor' ? '🟢 Competitor' : '🔵 Monopolist'}).`);
  return s;
}

export function setRole(state, playerId, role) {
  const s = clone(state);
  const p = s.players.find(x => x.id === playerId);
  if (p && s.status === 'lobby') { p.role = role; p.color = PLAYER_COLORS[role]; }
  return s;
}

// Rolul sugerat păstrează echilibrul (nr. egal ±1).
export function suggestRole(state) {
  const comp = state.players.filter(p => p.role === 'competitor').length;
  const mono = state.players.filter(p => p.role === 'monopolist').length;
  return comp <= mono ? 'competitor' : 'monopolist';
}

export function startGame(state, { firstPlayerId } = {}) {
  const s = clone(state);
  if (s.players.length < 2) return s;
  s.status = 'playing';
  s.turn = firstPlayerId || s.players[0].id;
  s.dice = null;
  s.doublesCount = 0;
  log(s, 'Jocul a început! 🎲');
  return s;
}

// ---------- tura: aruncă zarul ----------
export function applyRoll(state, dice) {
  const s = clone(state);
  if (s.status !== 'playing' || s.pending) return s;
  const p = currentPlayer(s);
  if (!p || p.bankrupt) return s;

  const [d1, d2] = dice;
  s.dice = [d1, d2];
  const isDouble = d1 === d2;

  // Închisoare: dacă e în închisoare, dublele îl scot.
  if (p.inJail) {
    if (isDouble) {
      p.inJail = false; p.jailTurns = 0;
      log(s, `${p.name} a dat dublă și iese din închisoare!`);
    } else {
      p.jailTurns += 1;
      log(s, `${p.name} nu a dat dublă (${p.jailTurns}/3).`);
      if (p.jailTurns >= 3) { p.inJail = false; p.jailTurns = 0; p.money -= 50; log(s, `${p.name} plătește €50 și iese.`); }
      s.doublesCount = 0;
      return s; // rămâne pe loc, tura se va încheia
    }
  }

  // 3 duble la rând → închisoare
  if (isDouble) {
    s.doublesCount = (s.doublesCount || 0) + 1;
    if (s.doublesCount >= 3) {
      sendToJail(s, p);
      log(s, `${p.name} a dat 3 duble → la închisoare!`);
      s.doublesCount = 0;
      return s;
    }
  } else {
    s.doublesCount = 0;
  }

  move(s, p, d1 + d2);
  resolveLanding(s, p, [d1, d2]);
  return s;
}

function move(s, p, steps) {
  const from = p.pos;
  let np = (from + steps) % 40;
  // trecere peste START (fără să pice fix pe el)
  if (np < from && np !== START) { p.money += PASS_START; log(s, `${p.name} trece pe la START (+€${PASS_START}).`); }
  else if (np < from && np === START) { /* pică fix pe start, tratat mai jos */ }
  else if (np > from) { /* fără trecere */ }
  p.pos = np;
}

function resolveLanding(s, p, dice) {
  const steps = dice[0] + dice[1];
  const idx = p.pos;
  const sq = BOARD[idx];

  if (idx === START) { p.money += LAND_START; log(s, `${p.name} aterizează pe START (+€${LAND_START}).`); return; }
  if (sq.type === 'corner') {
    if (sq.kind === 'gotojail') { sendToJail(s, p); log(s, `${p.name} → Consiliul Concurenței: la închisoare!`); return; }
    if (sq.kind === 'fundatia') { resolveFundatia(s, p, dice[0]); return; }
    return; // jail (vizită) / restul
  }
  if (sq.type === 'tax') {
    if (sq.kind === 'income') { s.pending = { type: 'incometax', idx }; return; } // alegere €200 / % active
    p.money -= sq.amount; log(s, `${p.name} plătește ${sq.name} (−€${sq.amount}).`); return;
  }
  if (sq.type === 'card') { log(s, `${p.name} trage o carte ${p.role === 'competitor' ? '🟢' : '🔵'} (efect la Faza 3).`); return; }

  // proprietăți / transport / utilități
  if (sq.type === 'property' || sq.type === 'transport' || sq.type === 'utility') {
    const owner = ownerOf(s, idx);
    if (!owner) {
      if (p.money >= sq.price) s.pending = { type: 'buy', idx };
      return;
    }
    if (owner.id === p.id) return; // a lui
    const rent = computeRent(s, idx, steps);
    p.money -= rent; owner.money += rent;
    log(s, `${p.name} plătește €${rent} chirie lui ${owner.name} (${sq.name}).`);
  }
}

// Fundația Anti-Monopoly: Competitorul dă un zar (1→€25, 2→€50); Monopolistul plătește €160.
function resolveFundatia(s, p, die) {
  if (p.role === 'competitor') {
    const gain = die === 1 ? 25 : die === 2 ? 50 : 0;
    if (gain > 0) { p.money += gain; log(s, `${p.name} la Fundație: zar ${die} → +€${gain}.`); }
    else log(s, `${p.name} la Fundație: zar ${die} → nimic.`);
  } else {
    p.money -= 160; log(s, `${p.name} (Monopolist) plătește €160 la Fundație.`);
  }
}

// ---------- IMPOZIT PE VENIT (alegere: fix €200 sau % din active) ----------
export function playerAssets(state, playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return 0;
  let total = p.money;
  BOARD.forEach((sq, i) => {
    if (state.ownership?.[i] === playerId && 'price' in sq) {
      total += state.mortgaged?.[i] ? Math.round(sq.price / 2) : sq.price;
      const houses = state.buildings?.[i] || 0;
      total += houses * houseCost(i, p.role);
    }
  });
  return total;
}

export function incomeTaxOptions(state, playerId) {
  const p = state.players.find(x => x.id === playerId);
  const pct = p?.role === 'monopolist' ? 0.20 : 0.10;
  const percentAmount = Math.round(playerAssets(state, playerId) * pct);
  return { fixed: 200, percent: percentAmount, pct: Math.round(pct * 100) };
}

export function applyPayIncomeTax(state, mode) {
  const s = clone(state);
  if (s.pending?.type !== 'incometax') return s;
  const p = currentPlayer(s);
  const opts = incomeTaxOptions(s, p.id);
  const amount = mode === 'percent' ? opts.percent : opts.fixed;
  p.money -= amount;
  log(s, `${p.name} plătește impozit pe venit: ${mode === 'percent' ? `${opts.pct}% active` : 'fix'} (−€${amount}).`);
  s.pending = null;
  return s;
}

// ---------- CHIRII (Faza 2: roluri, clădiri, companii) ----------
// Coeficienți companii (chirie = suma zarului × coeficient de pe card).
const TRANSPORT_COEF = { 1: 4, 2: 8, 3: 12, 4: 20 };
const UTILITY_COEF = { 1: 4, 2: 10 };

export function computeRent(s, idx, diceSum = 0) {
  const sq = BOARD[idx];
  const ownerId = s.ownership?.[idx];
  if (!ownerId || s.mortgaged?.[idx]) return 0;
  const owner = s.players.find(p => p.id === ownerId);
  const houses = s.buildings?.[idx] || 0;

  if (sq.type === 'property') {
    const base = sq.baseRent;
    if (owner?.role === 'monopolist') {
      // Monopolistul: dublează baza pe tot orașul; fiecare casă adaugă 2×bază (chirii mari).
      const monopoly = ownsWholeGroup(s, ownerId, sq.group);
      const b = monopoly ? base * 2 : base;
      return b + houses * (base * 2);
    }
    // Competitorul: chirii moderate; fiecare casă adaugă 1×bază.
    return base * (1 + houses);
  }
  if (sq.type === 'transport') {
    const count = countOwned(s, ownerId, 'transport');
    return (diceSum || 7) * (TRANSPORT_COEF[count] || 0);
  }
  if (sq.type === 'utility') {
    const count = countOwned(s, ownerId, 'utility');
    return (diceSum || 7) * (UTILITY_COEF[count] || 0);
  }
  return 0;
}

// ---------- CONSTRUCȚIE ----------
// Costul unei case: Competitor = ½ preț; Monopolist = preț întreg (clădiri mai scumpe).
export function houseCost(idx, role) {
  const sq = BOARD[idx];
  if (!sq || sq.type !== 'property') return Infinity;
  return role === 'monopolist' ? sq.price : Math.round(sq.price / 2);
}

// Poate construi? Competitor: pe orice proprietate a lui. Monopolist: doar cu tot orașul.
export function canBuild(state, playerId, idx) {
  const sq = BOARD[idx];
  if (!sq || sq.type !== 'property') return false;
  if (state.ownership?.[idx] !== playerId) return false;
  if (state.mortgaged?.[idx]) return false;
  if ((state.buildings?.[idx] || 0) >= 4) return false;
  const p = state.players.find(x => x.id === playerId);
  if (!p) return false;
  if (p.role === 'monopolist' && !ownsWholeGroup(state, playerId, sq.group)) return false;
  return p.money >= houseCost(idx, p.role);
}

// Lista proprietăților pe care jucătorul poate construi acum.
export function buildableFor(state, playerId) {
  const out = [];
  BOARD.forEach((sq, i) => { if (canBuild(state, playerId, i)) out.push(i); });
  return out;
}

export function applyBuild(state, idx) {
  const s = clone(state);
  const p = currentPlayer(s);
  if (!p || !canBuild(s, p.id, idx)) return s;
  const cost = houseCost(idx, p.role);
  p.money -= cost;
  s.buildings[idx] = (s.buildings[idx] || 0) + 1;
  log(s, `${p.name} construiește pe ${BOARD[idx].name} (−€${cost}) → ${s.buildings[idx]} 🏠`);
  return s;
}

function countOwned(s, playerId, type) {
  let n = 0;
  BOARD.forEach((sq, i) => { if (sq.type === type && s.ownership?.[i] === playerId) n++; });
  return n;
}

function sendToJail(s, p) { p.pos = JAIL; p.inJail = true; p.jailTurns = 0; }

// ---------- cumpărare ----------
export function applyBuy(state) {
  const s = clone(state);
  if (s.pending?.type !== 'buy') return s;
  const idx = s.pending.idx;
  const p = currentPlayer(s);
  const sq = BOARD[idx];
  if (p && p.money >= sq.price) {
    p.money -= sq.price;
    s.ownership[idx] = p.id;
    log(s, `${p.name} cumpără ${sq.name} (−€${sq.price}).`);
  }
  s.pending = null;
  return s;
}

export function applyDeclineBuy(state) {
  const s = clone(state);
  if (s.pending?.type === 'buy') {
    log(s, `${currentPlayer(s)?.name} refuză cumpărarea. (licitație — Faza 3)`);
    s.pending = null;
  }
  return s;
}

// ---------- sfârșit tură ----------
export function applyEndTurn(state) {
  const s = clone(state);
  if (s.status !== 'playing' || s.pending) return s;
  // dublă → același jucător mai joacă o dată (dacă nu e în închisoare)
  const p = currentPlayer(s);
  const rolledDouble = s.dice && s.dice[0] === s.dice[1] && !p?.inJail && s.doublesCount > 0;
  s.dice = null;
  if (rolledDouble) { log(s, `${p.name} a dat dublă — mai joacă o dată.`); return s; }

  s.doublesCount = 0;
  const active = s.players.filter(x => !x.bankrupt);
  const curIdx = active.findIndex(x => x.id === s.turn);
  const next = active[(curIdx + 1) % active.length];
  s.turn = next?.id || null;
  return s;
}

// ---------- utils ----------
export function randomCode() {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const c = () => letters[Math.floor(Math.random() * letters.length)];
  return `${c()}${c()}${c()}${Math.floor(10 + Math.random() * 89)}`;
}
export function rollDicePair() {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}
