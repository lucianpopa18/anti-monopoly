import { useState } from 'react';
import { BOARD, GROUPS } from './game/board.js';
import { gridPos, isCorner } from './game/layout.js';
import {
  createGame, addPlayer, startGame, applyRoll, applyBuy, applyDeclineBuy,
  applyEndTurn, currentPlayer, ownerOf, rollDicePair, suggestRole,
} from './game/engine.js';

export default function App() {
  const [game, setGame] = useState(null);
  if (!game) return <Setup onStart={setGame} />;
  if (game.status === 'lobby') return <Lobby game={game} setGame={setGame} />;
  return <Table game={game} setGame={setGame} />;
}

/* ---------------- SETUP (local hot-seat) ---------------- */
function Setup({ onStart }) {
  const [names, setNames] = useState(['', '']);
  const [mode, setMode] = useState('classic');

  const update = (i, v) => setNames(n => n.map((x, k) => (k === i ? v : x)));
  const add = () => names.length < 6 && setNames(n => [...n, '']);
  const remove = (i) => names.length > 2 && setNames(n => n.filter((_, k) => k !== i));

  const start = () => {
    const clean = names.map(n => n.trim()).filter(Boolean);
    if (clean.length < 2) return;
    let g = createGame({ hostName: clean[0], hostRole: 'competitor', mode });
    for (let i = 1; i < clean.length; i++) g = addPlayer(g, clean[i]);
    onStart(g);
  };

  const valid = names.map(n => n.trim()).filter(Boolean).length >= 2;

  return (
    <div className="wrap">
      <div className="title">Anti<b>-Monopoly</b></div>
      <div className="sub">Competiție vs Cartel · versiune de test (pe un telefon)</div>

      <div className="panel">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Jucători (2–6)</div>
        <div className="plist">
          {names.map((n, i) => (
            <div className="row" key={i}>
              <input className="field" placeholder={`Nume jucător ${i + 1}`} value={n}
                onChange={e => update(i, e.target.value)} maxLength={20} />
              {names.length > 2 && (
                <button className="btn ghost" style={{ minWidth: 48 }} onClick={() => remove(i)} aria-label="Șterge">✕</button>
              )}
            </div>
          ))}
        </div>
        {names.length < 6 && <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={add}>+ Adaugă jucător</button>}
        <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>Rolurile (🟢 Competitor / 🔵 Monopolist) se împart automat, echilibrat.</p>
      </div>

      <div className="panel">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Mod de joc</div>
        <div className="rolePick">
          <button className={`roleBtn ${mode === 'classic' ? 'comp on' : ''}`} onClick={() => setMode('classic')}>Clasic<br /><small>ultimul rămas</small></button>
          <button className={`roleBtn ${mode === 'short' ? 'mono on' : ''}`} onClick={() => setMode('short')}>Scurt<br /><small>o tabără falimentează</small></button>
        </div>
      </div>

      <button className="btn" style={{ width: '100%' }} disabled={!valid} onClick={start}>Începe jocul 🎲</button>
    </div>
  );
}

/* ---------------- LOBBY (confirmă roluri) ---------------- */
function Lobby({ game, setGame }) {
  const start = () => setGame(startGame(game));
  return (
    <div className="wrap">
      <div className="title">Anti<b>-Monopoly</b></div>
      <div className="sub">Camera pregătită · {game.mode === 'classic' ? 'mod Clasic' : 'mod Scurt'}</div>
      <div className="panel">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Jucători & roluri</div>
        <div className="plist">
          {game.players.map(p => (
            <div className="pchip" key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <b>{p.name}</b>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 800 }}>
                {p.role === 'competitor' ? '🟢 Competitor' : '🔵 Monopolist'}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button className="btn" style={{ width: '100%' }} onClick={start}>Pornește 🎲</button>
    </div>
  );
}

/* ---------------- TABLA + JOCUL ---------------- */
function Table({ game, setGame }) {
  const [rolling, setRolling] = useState(false);
  const me = currentPlayer(game);

  const roll = () => {
    if (game.pending || rolling) return;
    setRolling(true);
    setTimeout(() => { setGame(g => applyRoll(g, rollDicePair())); setRolling(false); }, 350);
  };
  const buy = () => setGame(g => applyBuy(g));
  const decline = () => setGame(g => applyDeclineBuy(g));
  const endTurn = () => setGame(g => applyEndTurn(g));

  const pendingSq = game.pending?.type === 'buy' ? BOARD[game.pending.idx] : null;
  const canRoll = !game.pending && !rolling;
  const rolledDouble = game.dice && game.dice[0] === game.dice[1] && !me?.inJail;

  return (
    <div className="wrap">
      <Board game={game} />

      <div className="hud">
        <div className="turnbar">
          <span className="dot" style={{ background: me?.color, width: 16, height: 16 }} />
          <span className="who">{me?.name}{me?.inJail ? ' 🔒' : ''}</span>
          <span style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 13 }}>
            {me?.role === 'competitor' ? '🟢' : '🔵'} · {BOARD[me?.pos]?.name}
          </span>
          <span className="mon">€{me?.money}</span>
        </div>

        {game.dice && (
          <div className="dice">
            <div className="die">{game.dice[0]}</div>
            <div className="die">{game.dice[1]}</div>
          </div>
        )}

        {pendingSq ? (
          <div className="actions">
            <button className="btn" onClick={buy}>Cumpără {pendingSq.name} · €{pendingSq.price}</button>
            <button className="btn ghost" onClick={decline}>Refuz</button>
          </div>
        ) : (
          <div className="actions">
            <button className="btn" onClick={roll} disabled={!canRoll}>
              {rolling ? '…' : game.dice ? (rolledDouble ? 'Dublă! Mai arunci 🎲' : '🎲 Aruncă') : '🎲 Aruncă zarul'}
            </button>
            {game.dice && !rolledDouble && <button className="btn ghost" onClick={endTurn}>Termină tura →</button>}
            {game.dice && rolledDouble && <button className="btn ghost" onClick={endTurn}>Continuă →</button>}
          </div>
        )}

        <div className="moneyList">
          {game.players.map(p => (
            <span key={p.id} className={`moneyChip ${p.id === game.turn ? 'turn' : ''}`}>
              <span className="dot" style={{ background: p.color }} /> {p.name}: €{p.money}
            </span>
          ))}
        </div>

        <div className="log">
          {(game.log || []).slice(-14).reverse().map((l, i) => <div key={i}>{l.text}</div>)}
        </div>
      </div>
    </div>
  );
}

function Board({ game }) {
  const cells = [];
  for (let i = 0; i < 40; i++) {
    const sq = BOARD[i];
    const { row, col } = gridPos(i);
    const owner = ownerOf(game, i);
    const tokens = game.players.filter(p => p.pos === i && !p.bankrupt);
    const groupColor = sq.type === 'property' ? GROUPS[sq.group]?.color : null;

    cells.push(
      <div key={i} className={`cell ${isCorner(i) ? 'corner' : ''}`} style={{ gridRow: row, gridColumn: col }}>
        {isCorner(i) ? (
          <div className="cornerLabel">{cornerLabel(sq)}</div>
        ) : (
          <>
            {groupColor && <div className="bar" style={{ background: groupColor }} />}
            {sq.type === 'transport' && <div className="bar" style={{ background: '#7A8B99' }} />}
            {sq.type === 'utility' && <div className="bar" style={{ background: '#B9A06B' }} />}
            {sq.type === 'card' && <div className="bar" style={{ background: '#4b5563' }} />}
            {sq.type === 'tax' && <div className="bar" style={{ background: '#8a3b3b' }} />}
            <div className="cn">{shortName(sq)}</div>
            {'price' in sq && <div className="cp">€{sq.price}</div>}
            {owner && <span className="ownDot" style={{ background: owner.color }} />}
          </>
        )}
        {tokens.length > 0 && (
          <div className="toks">
            {tokens.map(t => <span key={t.id} className="tok" style={{ background: t.color }} />)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="board">
      {cells}
      <div className="center"><div className="centerInner"><div className="brand">ANTI<small>MONOPOLY</small></div></div></div>
    </div>
  );
}

function shortName(sq) {
  if (sq.type === 'card') return 'Cărți';
  if (sq.type === 'tax') return sq.name;
  return sq.name;
}
function cornerLabel(sq) {
  if (sq.kind === 'start') return 'START →';
  if (sq.kind === 'jail') return '🔒 Închisoare';
  if (sq.kind === 'fundatia') return 'Fundația';
  if (sq.kind === 'gotojail') return 'La Închisoare';
  return sq.name;
}
