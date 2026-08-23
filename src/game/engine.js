// ================= ANTI-MONOPOLY · MOTORUL =================
// Mașină de stare PURĂ, agnostică de UI. Toate acțiunile primesc starea și
// întorc o stare NOUĂ (imutabil) — ușor de sincronizat online (o gazdă aplică
// acțiunea, trimite starea rezultată tuturor). Randomul zarului se poate injecta
// (pentru teste + pentru „gazda aruncă, ceilalți văd").

import { BOARD, GROUPS, START, JAIL, GOTOJAIL, FUNDATIA, groupIndexes, GROUP_SIZE } from './board.js';
import { deckFor } from './cards.js';

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
// Eveniment vizual (chirie / taxă / închisoare / START / fundație) → pop-up în UI.
// Ca și lastCard: seq unic, ca pop-up-ul să apară o singură dată per eveniment.
function event(state, ev) {
  state.eventSeq = (state.eventSeq || 0) + 1;
  state.lastEvent = { ...ev, seq: state.eventSeq };
}
// Dacă jucătorul `pid` tocmai a completat un ORAȘ întreg (monopol) achiziționând căsuța `idx`,
// emite un eveniment de sărbătoare (pentru animația „wow" din UI).
function maybeMonopolyEvent(state, pid, idx) {
  const sq = BOARD[idx];
  if (!sq || sq.type !== 'property') return;
  if (!ownsWholeGroup(state, pid, sq.group)) return;
  const p = state.players.find(x => x.id === pid);
  event(state, { kind: 'monopoly', who: p?.name, whoId: pid, group: sq.group, groupName: GROUPS[sq.group]?.name || 'orașul' });
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
export function createGame({ code, hostName, hostRole = 'competitor', mode = 'classic', hostId }) {
  const host = makePlayer(hostName, hostRole, hostId);
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

export function makePlayer(name, role = 'competitor', id) {
  return {
    id: id || `p_${Math.random().toString(36).slice(2, 9)}`,
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

export function addPlayer(state, name, role, id) {
  const s = clone(state);
  if (s.status !== 'lobby') return s;
  if (id && s.players.some(x => x.id === id)) return s; // deja în cameră (rejoin)
  if (s.players.length >= 6) return s;
  const p = makePlayer(name, role || suggestRole(s), id);
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
  // A aruncat deja o dată fără dublă → nu mai poate arunca (trebuie să încheie tura).
  // La dublă, s.dice are valori egale, deci aruncarea următoare e permisă.
  if (s.dice && s.dice[0] !== s.dice[1]) return s;
  s.rollSeq = (s.rollSeq || 0) + 1; // contor de aruncare (pt animația zarului în online)
  s.lastCard = null; // bannerul cărții e valabil doar pentru mutarea curentă
  s.lastEvent = null; // evenimentul (chirie/taxă/etc) e valabil doar pentru mutarea curentă
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
      event(s, { kind: 'jail', who: p.name, reason: 'doubles' });
      s.doublesCount = 0;
      return s;
    }
  } else {
    s.doublesCount = 0;
  }

  move(s, p, d1 + d2);
  resolveLanding(s, p, [d1, d2]);
  checkDebt(s, p);
  return s;
}

// Dacă jucătorul a ajuns pe minus, intră „în datorie": trebuie să facă rost de
// bani (ipotecă / vinde case) sau declară faliment.
function checkDebt(s, p) {
  if (p && p.money < 0) s.debt = { playerId: p.id, amount: -p.money };
  else if (s.debt && s.debt.playerId === p?.id && p.money >= 0) s.debt = null;
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

  if (idx === START) { p.money += LAND_START; log(s, `${p.name} aterizează pe START (+€${LAND_START}).`); event(s, { kind: 'start', who: p.name, amount: LAND_START }); return; }
  if (sq.type === 'corner') {
    if (sq.kind === 'gotojail') { sendToJail(s, p); log(s, `${p.name} → Consiliul Concurenței: la închisoare!`); event(s, { kind: 'jail', who: p.name, reason: 'gotojail' }); return; }
    if (sq.kind === 'fundatia') { resolveFundatia(s, p, dice[0]); return; }
    return; // jail (vizită) / restul
  }
  if (sq.type === 'tax') {
    if (sq.kind === 'income') { s.pending = { type: 'incometax', idx }; return; } // alegere €200 / % active
    p.money -= sq.amount; log(s, `${p.name} plătește ${sq.name} (−€${sq.amount}).`); event(s, { kind: 'tax', who: p.name, name: sq.name, amount: sq.amount }); return;
  }
  if (sq.type === 'card') { drawCard(s, p, false); return; }

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
    event(s, { kind: 'rent', who: p.name, owner: owner.name, amount: rent, idx });
  }
}

// ---------- CĂRȚI ----------
function drawCard(s, p, fromMove) {
  const deck = deckFor(p.role);
  const card = deck[Math.floor(Math.random() * deck.length)];
  s.cardSeq = (s.cardSeq || 0) + 1; // id unic per tragere → pop-up-ul știe când e o carte nouă
  s.lastCard = { text: card.text, role: p.role, seq: s.cardSeq, money: (typeof card.money === 'number' ? card.money : null), who: p.name };
  log(s, `${p.name} ${p.role === 'competitor' ? '🟢' : '🔵'}: „${card.text}"`);

  if (typeof card.money === 'number') p.money += card.money;
  if (card.collectEach) {
    for (const other of s.players) {
      if (other.id !== p.id && !other.bankrupt) { other.money -= card.collectEach; p.money += card.collectEach; }
    }
  }
  if (card.getOutFree) p.getOutFree = (p.getOutFree || 0) + 1;
  if (card.jail) { sendToJail(s, p); return; }
  if (!fromMove && (card.moveTo != null || card.moveBy != null)) {
    if (card.moveTo != null) {
      if (card.moveTo === START) { p.pos = START; p.money += LAND_START; log(s, `${p.name} → START (+€${LAND_START}).`); }
      else { if (card.moveTo < p.pos) { p.money += PASS_START; } p.pos = card.moveTo; }
    } else {
      moveSimple(s, p, card.moveBy);
    }
    resolveLandingAfterCard(s, p);
  }
}
function moveSimple(s, p, steps) {
  const from = p.pos;
  const np = (from + steps + 40) % 40;
  if (np < from) { p.money += PASS_START; }
  p.pos = np;
}
// Rezolvă noua căsuță după o carte de mutare, dar NU mai trage altă carte (fără recursie).
function resolveLandingAfterCard(s, p) {
  const sq = BOARD[p.pos];
  // Bonusul de START e deja acordat în drawCard (când card.moveTo === START) — NU dubla aici.
  if (p.pos === START) return;
  if (sq.type === 'tax') { if (sq.kind === 'income') { s.pending = { type: 'incometax', idx: p.pos }; } else { p.money -= sq.amount; event(s, { kind: 'tax', who: p.name, name: sq.name, amount: sq.amount }); } return; }
  if (sq.type === 'corner' && sq.kind === 'gotojail') { sendToJail(s, p); event(s, { kind: 'jail', who: p.name, reason: 'gotojail' }); return; }
  if (sq.type === 'corner' && sq.kind === 'fundatia') { return; }
  if (sq.type === 'property' || sq.type === 'transport' || sq.type === 'utility') {
    const owner = ownerOf(s, p.pos);
    if (!owner) { if (p.money >= sq.price) s.pending = { type: 'buy', idx: p.pos }; return; }
    if (owner.id === p.id) return;
    const rent = computeRent(s, p.pos, 7);
    p.money -= rent; owner.money += rent;
    log(s, `${p.name} plătește €${rent} chirie lui ${owner.name} (${sq.name}).`);
    event(s, { kind: 'rent', who: p.name, owner: owner.name, amount: rent, idx: p.pos });
  }
}

// Fundația Anti-Monopoly: Competitorul dă un zar (1→€25, 2→€50); Monopolistul plătește €160.
function resolveFundatia(s, p, die) {
  if (p.role === 'competitor') {
    const gain = die === 1 ? 25 : die === 2 ? 50 : 0;
    if (gain > 0) { p.money += gain; log(s, `${p.name} la Fundație: zar ${die} → +€${gain}.`); }
    else log(s, `${p.name} la Fundație: zar ${die} → nimic.`);
    event(s, { kind: 'fundatia', who: p.name, amount: gain, die });
  } else {
    p.money -= 160; log(s, `${p.name} (Monopolist) plătește €160 la Fundație.`);
    event(s, { kind: 'fundatia', who: p.name, amount: -160, die });
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
      // doar proprietățile pot avea case; houseCost e Infinity pt. transport/utilități → evită 0*Infinity=NaN
      const houses = state.buildings?.[i] || 0;
      if (sq.type === 'property' && houses > 0) total += houses * houseCost(i, p.role);
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
    s.pending = null;
    maybeMonopolyEvent(s, p.id, idx);
    return s;
  }
  s.pending = null;
  return s;
}

export function applyDeclineBuy(state) {
  const s = clone(state);
  if (s.pending?.type === 'buy') {
    const idx = s.pending.idx;
    log(s, `${currentPlayer(s)?.name} refuză. Se scoate la licitație ${BOARD[idx].name}.`);
    s.pending = { type: 'auction', idx, highBid: 0, highBidderId: null, passed: [] };
  }
  return s;
}

// ---------- IPOTECĂ / VÂNZARE CASE ----------
export function canMortgage(state, idx) {
  const sq = BOARD[idx];
  return sq && 'price' in sq && !state.mortgaged?.[idx] && (state.buildings?.[idx] || 0) === 0;
}
export function applyMortgage(state, idx) {
  const s = clone(state);
  const p = currentPlayer(s);
  if (!p || s.ownership?.[idx] !== p.id || !canMortgage(s, idx)) return s;
  const val = Math.round(BOARD[idx].price / 2);
  s.mortgaged[idx] = true;
  p.money += val;
  log(s, `${p.name} ipotechează ${BOARD[idx].name} (+€${val}).`);
  checkDebt(s, p);
  return s;
}
export function applyUnmortgage(state, idx) {
  const s = clone(state);
  const p = currentPlayer(s);
  if (!p || s.ownership?.[idx] !== p.id || !s.mortgaged?.[idx]) return s;
  const cost = Math.round((BOARD[idx].price / 2) * 1.1);
  if (p.money < cost) return s;
  delete s.mortgaged[idx];
  p.money -= cost;
  log(s, `${p.name} răscumpără ${BOARD[idx].name} (−€${cost}).`);
  return s;
}
export function applySellHouse(state, idx) {
  const s = clone(state);
  const p = currentPlayer(s);
  if (!p || s.ownership?.[idx] !== p.id || (s.buildings?.[idx] || 0) === 0) return s;
  const refund = Math.round(houseCost(idx, p.role) / 2);
  s.buildings[idx] -= 1;
  p.money += refund;
  log(s, `${p.name} vinde o casă de pe ${BOARD[idx].name} (+€${refund}).`);
  checkDebt(s, p);
  return s;
}

// ---------- FALIMENT + CÂȘTIGĂTOR ----------
// Cât mai poate strânge un jucător (ipotecând tot + vânzând casele).
export function maxRaisable(state, playerId) {
  let sum = 0;
  BOARD.forEach((sq, i) => {
    if (state.ownership?.[i] !== playerId || !('price' in sq)) return;
    if (!state.mortgaged?.[i]) sum += Math.round(sq.price / 2);
    const p = state.players.find(x => x.id === playerId);
    const houses = state.buildings?.[i] || 0;
    // doar proprietățile au case (houseCost e Infinity pt. transport/utilități → evită 0*Infinity=NaN)
    if (sq.type === 'property' && houses > 0) sum += houses * Math.round(houseCost(i, p?.role || 'competitor') / 2);
  });
  return sum;
}
export function mustBankrupt(state, playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p || p.money >= 0) return false;
  return p.money + maxRaisable(state, playerId) < 0;
}
export function applyDeclareBankrupt(state) {
  const s = clone(state);
  const p = currentPlayer(s);
  if (!p) return s;
  // eliberează proprietățile (la bancă), șterge clădirile/ipotecile
  BOARD.forEach((sq, i) => {
    if (s.ownership?.[i] === p.id) { delete s.ownership[i]; delete s.buildings[i]; delete s.mortgaged[i]; }
  });
  p.bankrupt = true; p.money = 0;
  s.debt = null;
  log(s, `💥 ${p.name} a dat FALIMENT și iese din joc.`);
  checkWinner(s);
  if (s.status === 'playing') advanceTurn(s);
  return s;
}

export function checkWinner(s) {
  const active = s.players.filter(p => !p.bankrupt);
  const richest = (arr) => arr.slice().sort((a, b) => b.money - a.money)[0];
  let winner = null;
  if (active.length <= 1) winner = active[0] || null;
  else if (s.mode === 'short') {
    const comps = active.filter(p => p.role === 'competitor');
    const monos = active.filter(p => p.role === 'monopolist');
    if (monos.length === 0) winner = richest(comps);
    else if (comps.length === 0) winner = richest(monos);
  }
  if (winner) { s.winnerId = winner.id; s.status = 'ended'; log(s, `🏆 ${winner.name} câștigă jocul!`); }
}

function advanceTurn(s) {
  const active = s.players.filter(x => !x.bankrupt);
  if (active.length === 0) return;
  const curIdx = active.findIndex(x => x.id === s.turn);
  const next = active[(curIdx + 1) % active.length];
  s.turn = next?.id || null;
  s.dice = null; s.doublesCount = 0;
}

// ---------- SCHIMB (proprietăți neconstruite + bani) ----------
export function proposeTrade(state, { toId, giveProps = [], giveMoney = 0, getProps = [], getMoney = 0 }) {
  const s = clone(state);
  const fromId = s.turn;
  // doar proprietăți neconstruite
  const ok = [...giveProps, ...getProps].every(i => (s.buildings?.[i] || 0) === 0);
  if (!ok || fromId === toId) return s;
  s.pending = { type: 'trade', fromId, toId, giveProps, giveMoney: Math.max(0, giveMoney), getProps, getMoney: Math.max(0, getMoney) };
  return s;
}
export function applyAcceptTrade(state) {
  const s = clone(state);
  const t = s.pending;
  if (t?.type !== 'trade') return s;
  const from = s.players.find(p => p.id === t.fromId);
  const to = s.players.find(p => p.id === t.toId);
  if (!from || !to) { s.pending = null; return s; }
  t.giveProps.forEach(i => { if (s.ownership[i] === from.id) s.ownership[i] = to.id; });
  t.getProps.forEach(i => { if (s.ownership[i] === to.id) s.ownership[i] = from.id; });
  from.money += t.getMoney - t.giveMoney;
  to.money += t.giveMoney - t.getMoney;
  log(s, `🤝 Schimb acceptat între ${from.name} și ${to.name}.`);
  s.pending = null;
  // sărbătoare dacă vreun jucător a completat un oraș prin schimb
  t.giveProps.forEach(i => maybeMonopolyEvent(s, to.id, i));
  t.getProps.forEach(i => maybeMonopolyEvent(s, from.id, i));
  return s;
}
export function applyDeclineTrade(state) {
  const s = clone(state);
  if (s.pending?.type === 'trade') { log(s, 'Schimb refuzat.'); s.pending = null; }
  return s;
}

// ---------- LICITAȚIE (la refuzul cumpărării) ----------
export function applyBid(state, playerId, amount) {
  const s = clone(state);
  const a = s.pending;
  if (a?.type !== 'auction' || a.passed.includes(playerId)) return s;
  const player = s.players.find(p => p.id === playerId);
  if (!player || amount <= a.highBid || player.money < amount) return s;
  a.highBid = amount; a.highBidderId = playerId;
  log(s, `${player.name} licitează €${amount}.`);
  return s;
}
export function applyPassAuction(state, playerId) {
  const s = clone(state);
  const a = s.pending;
  if (a?.type !== 'auction' || a.passed.includes(playerId)) return s;
  a.passed.push(playerId);
  const eligible = s.players.filter(p => !p.bankrupt && !a.passed.includes(p.id));
  // se termină când rămâne cel mult unul care nu a pasat
  if (eligible.length <= 1) finalizeAuction(s);
  return s;
}
function finalizeAuction(s) {
  const a = s.pending;
  if (a.highBidderId) {
    const w = s.players.find(p => p.id === a.highBidderId);
    w.money -= a.highBid; s.ownership[a.idx] = w.id;
    log(s, `🔨 ${w.name} câștigă licitația pentru ${BOARD[a.idx].name} (€${a.highBid}).`);
    s.pending = null;
    maybeMonopolyEvent(s, w.id, a.idx);
    return;
  } else {
    log(s, `Nicio ofertă — ${BOARD[a.idx].name} rămâne la bancă.`);
  }
  s.pending = null;
}

// ---------- sfârșit tură ----------
export function applyEndTurn(state) {
  const s = clone(state);
  if (s.status !== 'playing' || s.pending || s.debt) return s;
  s.lastCard = null; // ascunde bannerul cărții când se schimbă tura
  s.lastEvent = null;
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
