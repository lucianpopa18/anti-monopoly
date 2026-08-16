import { useState, useEffect, useRef, Suspense } from 'react';
import { sfx } from './sfx.js';
import Board3D from './three/Board3D.jsx';
import { BOARD, GROUPS } from './game/board.js';
import { gridPos, isCorner } from './game/layout.js';
import {
  createGame, addPlayer, startGame, applyRoll, applyBuy, applyDeclineBuy,
  applyEndTurn, currentPlayer, ownerOf, rollDicePair,
  applyBuild, buildableFor, houseCost, applyPayIncomeTax, incomeTaxOptions,
  canMortgage, applyMortgage, applyUnmortgage, applySellHouse,
  mustBankrupt, applyDeclareBankrupt, proposeTrade, applyAcceptTrade, applyDeclineTrade,
  applyBid, applyPassAuction,
} from './game/engine.js';

export default function App() {
  const [game, setGame] = useState(null);

  // Sunete contextuale la schimbări de stare (carte trasă / câștig).
  const lastCardRef = useRef(null);
  const endedRef = useRef(false);
  useEffect(() => {
    if (!game) { lastCardRef.current = null; endedRef.current = false; return; }
    const cardKey = game.lastCard ? `${game.lastCard.text}` : null;
    if (cardKey && cardKey !== lastCardRef.current) { sfx.card(); lastCardRef.current = cardKey; }
    if (game.status === 'ended' && !endedRef.current) { sfx.win(); endedRef.current = true; }
  }, [game]);

  if (!game) return <Setup onStart={setGame} />;
  if (game.status === 'lobby') return <Lobby game={game} setGame={setGame} />;
  if (game.status === 'ended') return <WinnerScreen game={game} onRestart={() => setGame(null)} />;
  return <Table game={game} setGame={setGame} />;
}

function WinnerScreen({ game, onRestart }) {
  const w = game.players.find(p => p.id === game.winnerId);
  return (
    <div className="wrap">
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <div style={{ fontSize: 64 }}>🏆</div>
        <div className="title" style={{ marginTop: 8 }}>{w?.name} câștigă!</div>
        <div className="sub">{w?.role === 'competitor' ? '🟢 Competitor' : '🔵 Monopolist'} · {game.mode === 'short' ? 'mod Scurt' : 'mod Clasic'}</div>
      </div>
      <div className="panel">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Clasament final</div>
        <div className="plist">
          {game.players.slice().sort((a, b) => (b.bankrupt ? -1 : b.money) - (a.bankrupt ? -1 : a.money)).map(p => (
            <div className="pchip" key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <b>{p.name}</b>
              <span style={{ marginLeft: 'auto', fontWeight: 800, color: p.bankrupt ? 'var(--tax)' : 'var(--ink)' }}>
                {p.bankrupt ? '💥 faliment' : `€${p.money}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button className="btn" style={{ width: '100%' }} onClick={onRestart}>Joc nou 🎲</button>
    </div>
  );
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
  const [buildOpen, setBuildOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [shownDice, setShownDice] = useState(null);
  const [rollNonce, setRollNonce] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const wrapRef = useRef(null);
  const me = currentPlayer(game);

  const toggleImmersive = () => {
    const el = wrapRef.current;
    if (!immersive) {
      setImmersive(true);
      el?.requestFullscreen?.().catch(() => {});
    } else {
      setImmersive(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setImmersive(v => v && false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const [muted, setMuted] = useState(false);
  const toggleMute = () => { const m = !muted; setMuted(m); sfx.setMuted(m); };

  const roll = () => {
    if (game.pending || game.debt || rolling) return;
    const d = rollDicePair();
    sfx.roll();
    setShownDice(d);
    setRollNonce(n => n + 1);
    setRolling(true);
    // zarurile se rostogolesc cinematic ~1.15s, apoi aplicăm mutarea (pionul sare după)
    setTimeout(() => { setGame(g => applyRoll(g, d)); setRolling(false); }, 1200);
  };
  const buy = () => { sfx.pay(); setGame(g => applyBuy(g)); };
  const decline = () => setGame(g => applyDeclineBuy(g));
  const endTurn = () => { setBuildOpen(false); setManageOpen(false); setGame(g => applyEndTurn(g)); };
  const build = (idx) => { sfx.build(); setGame(g => applyBuild(g, idx)); };
  const payTax = (mode) => { sfx.pay(); setGame(g => applyPayIncomeTax(g, mode)); };

  const pendingSq = game.pending?.type === 'buy' ? BOARD[game.pending.idx] : null;
  const taxPending = game.pending?.type === 'incometax';
  const auction = game.pending?.type === 'auction' ? game.pending : null;
  const trade = game.pending?.type === 'trade' ? game.pending : null;
  const debt = game.debt || null;
  const taxOpts = taxPending ? incomeTaxOptions(game, me.id) : null;
  const rolledDouble = game.dice && game.dice[0] === game.dice[1] && !me?.inJail;
  // Poate arunca doar dacă n-a aruncat încă în tura asta SAU tocmai a dat dublă.
  const canRoll = !game.pending && !game.debt && !rolling && (!game.dice || rolledDouble);
  const buildable = me ? buildableFor(game, me.id) : [];
  const myProps = me ? BOARD.map((sq, i) => i).filter(i => game.ownership?.[i] === me.id) : [];

  return (
    <div className={`wrap game ${immersive ? 'immersive' : ''}`} ref={wrapRef}>
      <div className="topBtns">
        <button className="fsBtn" onClick={toggleMute} aria-label={muted ? 'Activează sunetul' : 'Oprește sunetul'}>{muted ? '🔇' : '🔊'}</button>
        <button className="fsBtn" onClick={toggleImmersive} aria-label={immersive ? 'Ieși din ecran complet' : 'Ecran complet'}>{immersive ? '✕' : '⛶'}</button>
      </div>
      <Suspense fallback={<div className="canvas3d" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Se încarcă tabla 3D…</div>}>
        <Board3D game={game} dice={shownDice ?? game.dice} rollNonce={rollNonce} />
      </Suspense>

      <div className="hud">
        <div className="turnbar">
          <span className="dot" style={{ background: me?.color, width: 16, height: 16 }} />
          <span className="who">{me?.name}{me?.inJail ? ' 🔒' : ''}</span>
          <span style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 13 }}>
            {me?.role === 'competitor' ? '🟢' : '🔵'}
          </span>
          <span className="mon">€{me?.money}</span>
        </div>

        {game.dice && (
          <div className="dice">
            <div className={`die ${rolling ? 'rolling' : 'landed'}`}>{game.dice[0]}</div>
            <div className={`die ${rolling ? 'rolling' : 'landed'}`}>{game.dice[1]}</div>
          </div>
        )}

        {game.lastCard && !game.pending && (
          <div className="cardBanner">
            🃏 {game.lastCard.role === 'competitor' ? '🟢' : '🔵'} {game.lastCard.text}
          </div>
        )}

        {debt && (
          <div className="debtBanner">
            <b>💸 {me.name} datorează €{debt.amount}.</b> Fă rost de bani (ipotecă / vinde case) sau declară faliment.
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setManageOpen(true)}>🏦 Gestionează</button>
            {mustBankrupt(game, me.id) && (
              <button className="btn ghost" style={{ width: '100%', marginTop: 6, color: 'var(--tax)', borderColor: 'var(--tax)' }}
                onClick={() => setGame(g => applyDeclareBankrupt(g))}>💥 Declar faliment</button>
            )}
          </div>
        )}

        {pendingSq ? (
          <div className="actions">
            <button className="btn" onClick={buy} disabled={me.money < pendingSq.price}>Cumpără {pendingSq.name} · €{pendingSq.price}</button>
            <button className="btn ghost" onClick={decline}>Refuz</button>
          </div>
        ) : taxPending ? (
          <div className="actions">
            <button className="btn" onClick={() => payTax('fixed')}>Fix · €{taxOpts.fixed}</button>
            <button className="btn ghost" onClick={() => payTax('percent')}>{taxOpts.pct}% active · €{taxOpts.percent}</button>
          </div>
        ) : auction ? (
          <AuctionPanel game={game} setGame={setGame} auction={auction} />
        ) : trade ? (
          <TradePanel game={game} setGame={setGame} trade={trade} />
        ) : debt ? null : (
          <>
            <div className="actions">
              {(!game.dice || rolledDouble) && (
                <button className="btn" onClick={roll} disabled={!canRoll}>
                  {rolling ? '…' : rolledDouble ? 'Dublă! Mai arunci 🎲' : '🎲 Aruncă zarul'}
                </button>
              )}
              {game.dice && !rolledDouble && <button className="btn" onClick={endTurn}>Termină tura →</button>}
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              {buildable.length > 0 && (
                <button className="btn ghost" onClick={() => { setBuildOpen(o => !o); setManageOpen(false); }}>
                  🏠 Construiește ({buildable.length})
                </button>
              )}
              <button className="btn ghost" onClick={() => { setManageOpen(o => !o); setBuildOpen(false); }}>🏦 Gestionează</button>
            </div>
            {buildOpen && buildable.length > 0 && (
              <div className="panel" style={{ marginTop: 8, marginBottom: 0 }}>
                <p className="sub" style={{ margin: '0 0 8px', textAlign: 'left' }}>
                  {me.role === 'monopolist' ? 'Monopolist: construiești pe orașe complete.' : 'Competitor: construiești pe orice proprietate a ta.'}
                </p>
                <div className="plist">
                  {buildable.map(idx => (
                    <button key={idx} className="pchip" style={{ border: 'none', cursor: 'pointer' }} onClick={() => build(idx)}>
                      <span className="dot" style={{ background: (GROUPS[BOARD[idx].group]?.color) }} />
                      <b>{BOARD[idx].name}</b>
                      <span style={{ marginLeft: 'auto', fontWeight: 800 }}>
                        {'🏠'.repeat(game.buildings?.[idx] || 0)} +🏠 €{houseCost(idx, me.role)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {manageOpen && <ManagePanel game={game} setGame={setGame} me={me} myProps={myProps} />}

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

/* ---- Licitație ---- */
function AuctionPanel({ game, setGame, auction }) {
  const sq = BOARD[auction.idx];
  const eligible = game.players.filter(p => !p.bankrupt && !auction.passed.includes(p.id));
  const bid = (pid, amount) => setGame(g => applyBid(g, pid, amount));
  const pass = (pid) => setGame(g => applyPassAuction(g, pid));
  const high = auction.highBid;
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>🔨 Licitație: {sq.name}</div>
      <p className="sub" style={{ textAlign: 'left', margin: '0 0 10px' }}>
        Ofertă maximă: <b style={{ color: 'var(--ink)' }}>€{high}</b>
        {auction.highBidderId && ` · ${game.players.find(p => p.id === auction.highBidderId)?.name}`}
      </p>
      <div className="plist">
        {eligible.map(p => (
          <div className="pchip" key={p.id}>
            <span className="dot" style={{ background: p.color }} />
            <b>{p.name}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>€{p.money}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn" style={{ minHeight: 36, padding: '0 10px', fontSize: 13 }}
                disabled={p.money < high + 10} onClick={() => bid(p.id, high + 10)}>+€10</button>
              <button className="btn" style={{ minHeight: 36, padding: '0 10px', fontSize: 13 }}
                disabled={p.money < high + 50} onClick={() => bid(p.id, high + 50)}>+€50</button>
              <button className="btn ghost" style={{ minHeight: 36, padding: '0 10px', fontSize: 13 }} onClick={() => pass(p.id)}>Pas</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Schimb: oferta primită ---- */
function TradePanel({ game, setGame, trade }) {
  const from = game.players.find(p => p.id === trade.fromId);
  const to = game.players.find(p => p.id === trade.toId);
  const names = (idxs) => idxs.map(i => BOARD[i].name).join(', ') || '—';
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>🤝 {from.name} propune un schimb lui {to.name}</div>
      <div className="pchip" style={{ display: 'block' }}>
        <div><b>{from.name}</b> dă: {names(trade.giveProps)}{trade.giveMoney ? ` + €${trade.giveMoney}` : ''}</div>
        <div style={{ marginTop: 4 }}><b>{to.name}</b> dă: {names(trade.getProps)}{trade.getMoney ? ` + €${trade.getMoney}` : ''}</div>
      </div>
      <p className="sub" style={{ margin: '8px 0' }}>Decide {to.name}:</p>
      <div className="actions">
        <button className="btn" onClick={() => setGame(g => applyAcceptTrade(g))}>Accept</button>
        <button className="btn ghost" onClick={() => setGame(g => applyDeclineTrade(g))}>Refuz</button>
      </div>
    </div>
  );
}

/* ---- Gestionare: ipotecă / vânzare case / propunere schimb ---- */
function ManagePanel({ game, setGame, me, myProps }) {
  const [tradeWith, setTradeWith] = useState(null);
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);
  const [giveMoney, setGiveMoney] = useState('');
  const [getMoney, setGetMoney] = useState('');

  const mortgage = (i) => setGame(g => applyMortgage(g, i));
  const unmortgage = (i) => setGame(g => applyUnmortgage(g, i));
  const sell = (i) => setGame(g => applySellHouse(g, i));

  const others = game.players.filter(p => p.id !== me.id && !p.bankrupt);
  const theirProps = tradeWith
    ? BOARD.map((s, i) => i).filter(i => game.ownership?.[i] === tradeWith && (game.buildings?.[i] || 0) === 0)
    : [];
  const myTradeable = myProps.filter(i => (game.buildings?.[i] || 0) === 0);
  const toggle = (arr, set, i) => set(arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i]);
  const propose = () => {
    setGame(g => proposeTrade(g, {
      toId: tradeWith, giveProps: give, getProps: get,
      giveMoney: Number(giveMoney) || 0, getMoney: Number(getMoney) || 0,
    }));
  };

  return (
    <div className="panel" style={{ marginTop: 8, marginBottom: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>🏦 Proprietățile tale</div>
      {myProps.length === 0 && <p className="sub" style={{ textAlign: 'left', margin: 0 }}>Nu deții încă proprietăți.</p>}
      <div className="plist">
        {myProps.map(i => {
          const houses = game.buildings?.[i] || 0;
          const mort = game.mortgaged?.[i];
          return (
            <div className="pchip" key={i}>
              <span className="dot" style={{ background: (GROUPS[BOARD[i].group]?.color) || '#999' }} />
              <b style={{ fontSize: 13 }}>{BOARD[i].name}</b>
              {mort && <span style={{ color: 'var(--tax)', fontSize: 11, fontWeight: 800 }}>ipotecat</span>}
              {houses > 0 && <span style={{ fontSize: 11 }}>{'🏠'.repeat(houses)}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {houses > 0 ? (
                  <button className="miniBtn" onClick={() => sell(i)}>Vinde 🏠 +€{Math.round(houseCost(i, me.role) / 2)}</button>
                ) : mort ? (
                  <button className="miniBtn" onClick={() => unmortgage(i)}>Răscumpără −€{Math.round((BOARD[i].price / 2) * 1.1)}</button>
                ) : canMortgage(game, i) ? (
                  <button className="miniBtn" onClick={() => mortgage(i)}>Ipotecă +€{Math.round(BOARD[i].price / 2)}</button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {others.length > 0 && !game.debt && (
        <>
          <div style={{ fontWeight: 900, margin: '14px 0 8px' }}>🤝 Propune un schimb</div>
          <div className="rolePick" style={{ flexWrap: 'wrap' }}>
            {others.map(p => (
              <button key={p.id} className={`roleBtn ${tradeWith === p.id ? 'comp on' : ''}`}
                style={{ flex: 'none', padding: '0 12px' }} onClick={() => { setTradeWith(p.id); setGive([]); setGet([]); }}>
                {p.name}
              </button>
            ))}
          </div>
          {tradeWith && (
            <div style={{ marginTop: 10 }}>
              <p className="sub" style={{ textAlign: 'left', margin: '0 0 4px' }}>Tu dai (fără case):</p>
              <div className="chipRow">
                {myTradeable.map(i => (
                  <button key={i} className={`tchip ${give.includes(i) ? 'on' : ''}`} onClick={() => toggle(give, setGive, i)}>{BOARD[i].name}</button>
                ))}
                {myTradeable.length === 0 && <span className="sub" style={{ margin: 0 }}>—</span>}
              </div>
              <p className="sub" style={{ textAlign: 'left', margin: '8px 0 4px' }}>Tu ceri:</p>
              <div className="chipRow">
                {theirProps.map(i => (
                  <button key={i} className={`tchip ${get.includes(i) ? 'on' : ''}`} onClick={() => toggle(get, setGet, i)}>{BOARD[i].name}</button>
                ))}
                {theirProps.length === 0 && <span className="sub" style={{ margin: 0 }}>—</span>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input className="field" placeholder="Bani dați €" inputMode="numeric" value={giveMoney} onChange={e => setGiveMoney(e.target.value)} />
                <input className="field" placeholder="Bani ceruți €" inputMode="numeric" value={getMoney} onChange={e => setGetMoney(e.target.value)} />
              </div>
              <button className="btn" style={{ width: '100%', marginTop: 8 }}
                disabled={give.length === 0 && get.length === 0 && !giveMoney && !getMoney}
                onClick={propose}>Trimite propunerea</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Board({ game }) {
  const herePos = game.players.find(p => p.id === game.turn)?.pos;
  const cells = [];
  for (let i = 0; i < 40; i++) {
    const sq = BOARD[i];
    const { row, col } = gridPos(i);
    const owner = ownerOf(game, i);
    const tokens = game.players.filter(p => p.pos === i && !p.bankrupt);
    const groupColor = sq.type === 'property' ? GROUPS[sq.group]?.color : null;
    const icon = squareIcon(sq);

    cells.push(
      <div key={i} className={`cell ${isCorner(i) ? 'corner' : ''} ${i === herePos ? 'here' : ''}`} style={{ gridRow: row, gridColumn: col }}>
        {isCorner(i) ? (
          <div className="cornerLabel">{cornerLabel(sq)}</div>
        ) : (
          <>
            {groupColor && (
              <div className="bar" style={{ background: groupColor }}>
                {(game.buildings?.[i] || 0) > 0 && (
                  <span className="houses">{'🏠'.repeat(game.buildings[i])}</span>
                )}
              </div>
            )}
            <div className="cn">{sq.name}</div>
            {icon && <div className="ic">{icon}</div>}
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
      <div className="center">
        <Skyline />
        <div className="logo">
          <div className="lo1">ANTI</div>
          <div className="lo2">MONOPOLY</div>
          <div className="lo3">Afaceri imobiliare · Jocul secolului 21</div>
        </div>
      </div>
    </div>
  );
}

function Skyline() {
  return (
    <svg className="skyline" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
      <g fill="#16181A">
        <rect x="6" y="40" width="16" height="30" />
        <rect x="26" y="28" width="12" height="42" />
        <rect x="42" y="46" width="18" height="24" />
        <rect x="64" y="20" width="14" height="50" />
        <polygon points="71,20 71,8 78,20" />
        <rect x="82" y="36" width="20" height="34" />
        <rect x="106" y="26" width="12" height="44" />
        <rect x="122" y="14" width="16" height="56" />
        <rect x="128" y="6" width="4" height="10" />
        <rect x="142" y="44" width="20" height="26" />
        <rect x="166" y="30" width="14" height="40" />
        <rect x="184" y="18" width="16" height="52" />
        <rect x="204" y="40" width="18" height="30" />
        <rect x="226" y="24" width="12" height="46" />
        <rect x="242" y="34" width="20" height="36" />
        <rect x="266" y="12" width="14" height="58" />
        <rect x="272" y="4" width="3" height="9" />
        <rect x="284" y="42" width="12" height="28" />
      </g>
    </svg>
  );
}

const TRANSPORT_ICON = {
  'Transport Aerian': '✈️', 'Transport Feroviar': '🚆', 'Transport Maritim': '🚢', 'Transport Rutier': '🚌',
};
function squareIcon(sq) {
  if (sq.type === 'transport') return TRANSPORT_ICON[sq.name] || '🚆';
  if (sq.type === 'utility') return sq.name.includes('Electric') ? '⚡' : '🔥';
  if (sq.type === 'card') return '🃏';
  if (sq.type === 'tax') return '💶';
  return null;
}
function cornerLabel(sq) {
  if (sq.kind === 'start') return <><span className="big">↩</span>START</>;
  if (sq.kind === 'jail') return <><span className="big">🔒</span>Închisoare</>;
  if (sq.kind === 'fundatia') return <><span className="big">🏛️</span>Fundația</>;
  if (sq.kind === 'gotojail') return <><span className="big">👮</span>La Închisoare</>;
  return sq.name;
}
