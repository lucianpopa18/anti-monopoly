import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, startGame, applyRoll, applyBuy, applyDeclineBuy,
  applyEndTurn, currentPlayer, ownerOf, computeRent, START_MONEY, LAND_START, PASS_START,
  applyBuild, canBuild, houseCost, buildableFor, applyPayIncomeTax, incomeTaxOptions,
} from '../src/game/engine.js';
import { BOARD } from '../src/game/board.js';

function twoPlayerGame() {
  let g = createGame({ code: 'TEST1', hostName: 'Dudu', hostRole: 'competitor' });
  g = addPlayer(g, 'Bubu', 'monopolist');
  g = startGame(g, { firstPlayerId: g.players[0].id });
  return g;
}

test('creare + lobby: gazda e primul jucător', () => {
  const g = createGame({ code: 'AB12', hostName: 'Dudu' });
  assert.equal(g.players.length, 1);
  assert.equal(g.players[0].money, START_MONEY);
  assert.equal(g.status, 'lobby');
});

test('roluri echilibrate la adăugare', () => {
  let g = createGame({ code: 'AB12', hostName: 'A', hostRole: 'competitor' });
  g = addPlayer(g, 'B');
  assert.equal(g.players[1].role, 'monopolist'); // se echilibrează
});

test('aruncare mută pionul și oferă cumpărarea unei proprietăți libere', () => {
  const g = twoPlayerGame();
  const s = applyRoll(g, [1, 0]); // 1 pas → Corso Imperiale (idx 1)
  const p = currentPlayer(s);
  assert.equal(p.pos, 1);
  assert.equal(s.pending?.type, 'buy');
  assert.equal(s.pending.idx, 1);
});

test('cumpărare scade banii și setează proprietarul', () => {
  let g = twoPlayerGame();
  g = applyRoll(g, [1, 0]);
  const before = currentPlayer(g).money;
  g = applyBuy(g);
  assert.equal(ownerOf(g, 1).id, g.turn);
  assert.equal(currentPlayer(g).money, before - BOARD[1].price);
  assert.equal(g.pending, null);
});

test('chirie: al doilea jucător plătește proprietarului', () => {
  let g = twoPlayerGame();
  const [d, b] = g.players;
  // Dudu cumpără Corso Imperiale (idx 1)
  g = applyRoll(g, [1, 0]); g = applyBuy(g); g = applyEndTurn(g);
  assert.equal(g.turn, b.id);
  // Bubu ajunge pe idx 1 → plătește chirie
  g = applyRoll(g, [1, 0]);
  const rent = BOARD[1].baseRent;
  assert.equal(g.players.find(x => x.id === b.id).money, START_MONEY - rent);
  assert.equal(g.players.find(x => x.id === d.id).money, START_MONEY - BOARD[1].price + rent);
});

test('aterizare fix pe START dă €200 (nu €100)', () => {
  let g = twoPlayerGame();
  const p = currentPlayer(g);
  p.pos = 38; // 2 pași până la START (40)
  const before = p.money;
  g = applyRoll(g, [1, 1]); // dublă de 1 = 2 pași → START exact
  // dublă mută; pică pe START
  assert.equal(currentPlayer(g).pos, 0);
  assert.equal(currentPlayer(g).money, before + LAND_START);
});

test('trecere peste START dă €100', () => {
  let g = twoPlayerGame();
  const p = currentPlayer(g);
  p.pos = 39; // Sintagma; +3 → idx 2, trece peste START
  const before = p.money;
  g = applyRoll(g, [2, 1]); // 3 pași
  assert.equal(currentPlayer(g).pos, 2);
  assert.equal(currentPlayer(g).money, before + PASS_START);
});

test('monopolistul cu tot orașul dublează chiria de bază', () => {
  let g = twoPlayerGame();
  const mono = g.players[1]; // Bubu, monopolist
  // dăm lui Bubu ambele proprietăți Roma (idx 1 și 3)
  g.ownership = { 1: mono.id, 3: mono.id };
  const rentSingle = BOARD[1].baseRent;
  assert.equal(computeRent(g, 1, 7), rentSingle * 2);
});

test('3 duble la rând trimit la închisoare', () => {
  let g = twoPlayerGame();
  const p = g.players[0];
  p.pos = 6;
  g.ownership = { 8: p.id, 12: p.id }; // aterizează pe proprietăți proprii (fără pending)
  g = applyRoll(g, [1, 1]); g = applyEndTurn(g); // dublă 1 → pos 8 (a lui)
  g = applyRoll(g, [2, 2]); g = applyEndTurn(g); // dublă 2 → pos 12 (a lui)
  g = applyRoll(g, [3, 3]);                       // dublă 3 → jail
  assert.equal(g.players[0].inJail, true);
  assert.equal(g.players[0].pos, 10);
});

test('refuz cumpărare curăță pending', () => {
  let g = twoPlayerGame();
  g = applyRoll(g, [1, 0]);
  g = applyDeclineBuy(g);
  assert.equal(g.pending, null);
  assert.equal(g.ownership[1], undefined);
});

test('Competitor construiește pe orice proprietate a lui (nu are nevoie de grup)', () => {
  let g = twoPlayerGame();
  const comp = g.players[0]; // competitor
  g.ownership = { 6: comp.id }; // Calea Victoriei (grup incomplet)
  assert.equal(canBuild(g, comp.id, 6), true);
  const cost = houseCost(6, 'competitor');
  assert.equal(cost, Math.round(BOARD[6].price / 2));
  const before = g.players[0].money;
  g = applyBuild(g, 6);
  assert.equal(g.buildings[6], 1);
  assert.equal(g.players[0].money, before - cost);
  // chiria crește cu o casă: base × 2
  assert.equal(computeRent(g, 6), BOARD[6].baseRent * 2);
});

test('Monopolist NU poate construi fără tot orașul, dar poate cu el', () => {
  let g = twoPlayerGame();
  const mono = g.players[1];
  g.ownership = { 6: mono.id, 8: mono.id }; // 2 din 3 București
  assert.equal(canBuild(g, mono.id, 6), false);
  g.ownership = { 6: mono.id, 8: mono.id, 9: mono.id }; // tot orașul
  assert.equal(canBuild(g, mono.id, 6), true);
  assert.equal(houseCost(6, 'monopolist'), BOARD[6].price); // clădiri mai scumpe
});

test('companii transport: chirie = suma zarului × coeficient după câte deții', () => {
  let g = twoPlayerGame();
  const o = g.players[0];
  g.ownership = { 5: o.id }; // 1 transport (Aerian)
  assert.equal(computeRent(g, 5, 8), 8 * 4);
  g.ownership = { 5: o.id, 15: o.id }; // 2 transporturi
  assert.equal(computeRent(g, 5, 8), 8 * 8);
});

test('impozit pe venit: alegere fix €200 vs % din active', () => {
  let g = twoPlayerGame();
  const p = g.players[0];
  p.pos = 3; // 1 pas → idx 4 (impozit pe venit)
  g.turn = p.id;
  g = applyRoll(g, [1, 0]);
  assert.equal(g.pending?.type, 'incometax');
  const opts = incomeTaxOptions(g, p.id);
  assert.equal(opts.fixed, 200);
  assert.equal(opts.percent, Math.round(START_MONEY * 0.10)); // competitor 10%
  g = applyPayIncomeTax(g, 'fixed');
  assert.equal(g.players[0].money, START_MONEY - 200);
  assert.equal(g.pending, null);
});

test('Fundația: Competitor cu zar 2 primește €50; Monopolist plătește €160', () => {
  // Competitor pică pe Fundația (idx 20) cu primul zar = 2
  let g = twoPlayerGame();
  const c = g.players[0];
  c.pos = 18; g.turn = c.id;
  g = applyRoll(g, [2, 0]); // primul zar 2 → +€50
  assert.equal(g.players[0].pos, 20);
  assert.equal(g.players[0].money, START_MONEY + 50);
  // Monopolist pică pe Fundația → −€160
  let g2 = twoPlayerGame();
  const m = g2.players[1];
  g2.turn = m.id; m.pos = 18;
  g2 = applyRoll(g2, [2, 0]);
  assert.equal(g2.players[1].money, START_MONEY - 160);
});
