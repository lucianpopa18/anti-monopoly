import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, startGame, applyRoll, applyBuy, applyDeclineBuy,
  applyEndTurn, currentPlayer, ownerOf, computeRent, START_MONEY, LAND_START, PASS_START,
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
  g = applyRoll(g, [2, 2]); g = applyEndTurn(g); // dublă 1, mai joacă
  g = applyRoll(g, [3, 3]); g = applyEndTurn(g); // dublă 2
  g = applyRoll(g, [1, 1]); // dublă 3 → jail
  const p = g.players[0];
  assert.equal(p.inJail, true);
  assert.equal(p.pos, 10);
});

test('refuz cumpărare curăță pending', () => {
  let g = twoPlayerGame();
  g = applyRoll(g, [1, 0]);
  g = applyDeclineBuy(g);
  assert.equal(g.pending, null);
  assert.equal(g.ownership[1], undefined);
});
