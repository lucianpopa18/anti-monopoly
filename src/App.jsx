import { useState, useEffect, useRef, Suspense, Component } from 'react';
import { sfx } from './sfx.js';
import Board3D from './three/Board3D.jsx';
import { BOARD, GROUPS } from './game/board.js';
import { cardInfo } from './game/cardinfo.js';
import { gridPos, isCorner } from './game/layout.js';
import {
  createGame, addPlayer, startGame, applyRoll, applyBuy, applyDeclineBuy,
  applyEndTurn, currentPlayer, ownerOf, rollDicePair,
  applyBuild, buildableFor, houseCost,
  canMortgage, applyMortgage, applyUnmortgage, applySellHouse,
  mustBankrupt, applyDeclareBankrupt, proposeTrade, applyAcceptTrade, applyDeclineTrade,
  applyBid, applyPassAuction, randomCode, playerAssets, ownsWholeGroup, applyPayJail,
} from './game/engine.js';
import { Room, newId } from './net/room.js';

const PAWN_STEP_SPEED = 7; // căsuțe/secundă — trebuie să fie egal cu STEP_SPEED din Board3D.jsx

// Prinde orice eroare de randare (inclusiv din canvas-ul 3D) și afișează un ecran
// de recuperare în loc de „pagină albă". `fallback(reset, error)` decide ce se arată.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    try { console.error('[AntiMonopoly] crash:', error, info?.componentStack); } catch { /* */ }
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) return this.props.fallback(this.reset, this.state.error);
    return this.props.children;
  }
}

// Acțiuni apelate prin nume — folosit de dispatch (local aplică direct, online trimite gazdei).
const ENGINE = {
  startGame, applyBuy, applyDeclineBuy, applyEndTurn, applyBuild,
  applyBid, applyPassAuction, applyAcceptTrade, applyDeclineTrade, applyMortgage,
  applyUnmortgage, applySellHouse, proposeTrade, applyDeclareBankrupt, applyPayJail,
};

// Vibrație scurtă pe telefon (best-effort; iOS Safari o ignoră, dar nu strică).
function haptic(kind = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const pat = kind === 'heavy' ? [25, 30, 25] : kind === 'medium' ? 18 : 9;
  try { navigator.vibrate(pat); } catch { /* */ }
}

const CONFETTI_COLORS = ['#2E9E5B', '#2E5BD8', '#E0A82E', '#EC407A', '#FF7043', '#42A5F5', '#EF5350', '#66BB6A'];

// Confetti (pur CSS, fără librării). Se folosește la câștig + la monopol.
function Confetti({ count = 90 }) {
  const pieces = useRef(null);
  if (!pieces.current) {
    pieces.current = Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 2.4 + Math.random() * 2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 7 + Math.random() * 7,
      sway: (Math.random() * 2 - 1) * 70,
      spin: 360 + Math.random() * 720,
    }));
  }
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.current.map((p, i) => (
        <span key={i} style={{
          left: p.left + '%', width: p.size, height: p.size * 0.62, background: p.color,
          animationDelay: p.delay + 's', animationDuration: p.dur + 's',
          '--sway': p.sway + 'px', '--spin': p.spin + 'deg',
        }} />
      ))}
    </div>
  );
}

// Ploaie de monede la încasări (START, cărți bune, monopol).
function CoinShower({ trigger }) {
  const [coins, setCoins] = useState([]);
  useEffect(() => {
    if (!trigger) return;
    setCoins(Array.from({ length: 16 }, (_, i) => ({
      id: `${trigger}-${i}`, left: 8 + Math.random() * 84,
      delay: Math.random() * 0.35, dur: 0.9 + Math.random() * 0.7,
    })));
    const t = setTimeout(() => setCoins([]), 1900);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!coins.length) return null;
  return (
    <div className="coinShower" aria-hidden="true">
      {coins.map(c => (
        <span key={c.id} style={{ left: c.left + '%', animationDelay: c.delay + 's', animationDuration: c.dur + 's' }}>🪙</span>
      ))}
    </div>
  );
}

// ---- Sesiune online salvată (pentru reconectare la refresh / pierdere de rețea) ----
const SESSION_KEY = 'am-session-v1';
const SESSION_TTL = 6 * 3600 * 1000; // 6 ore
function saveSession(meta) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...meta, ts: Date.now() })); } catch { /* */ }
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || !s.code || !s.myId || Date.now() - (s.ts || 0) > SESSION_TTL) return null;
    return s;
  } catch { return null; }
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* */ } }

// Clasament „Averea" — valoare netă (cash + proprietăți + case), nr. proprietăți și monopoluri.
function StandingsModal({ game, myId, conn, onClose }) {
  const netWorth = (pid) => playerAssets(game, pid);
  const propCount = (pid) => BOARD.filter((sq, i) => game.ownership?.[i] === pid).length;
  const monoCount = (pid) => Object.keys(GROUPS).filter(g => ownsWholeGroup(game, pid, g)).length;
  const isOff = (pid) => conn && !conn.includes(pid);
  const rows = game.players.slice().sort((a, b) => (b.bankrupt ? -1 : netWorth(b.id)) - (a.bankrupt ? -1 : netWorth(a.id)));
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <Modal onClose={onClose}>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>📊 Averea jucătorilor</div>
        <div className="plist">
          {rows.map((p, i) => {
            const mono = monoCount(p.id);
            return (
              <div className="pchip" key={p.id}>
                <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{p.bankrupt ? '💥' : (medals[i] || i + 1)}</span>
                <span className="dot" style={{ background: p.color }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <b>{p.name}{p.id === myId ? ' (tu)' : ''} {p.role === 'competitor' ? '🟢' : '🔵'}{isOff(p.id) ? ' 📵' : ''}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>
                    🏠 {propCount(p.id)} {mono > 0 ? `· 🏙️ ${mono} monopol${mono === 1 ? '' : 'uri'}` : ''}
                  </span>
                </div>
                <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <b style={{ fontSize: 15 }}>€{p.bankrupt ? 0 : netWorth(p.id)}</b>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>cash €{p.money}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="deedNote" style={{ marginTop: 10 }}>„Averea" = cash + proprietăți (½ dacă ipotecate) + case. Cel mai bogat câștigă la final.</p>
      </div>
    </Modal>
  );
}

// Ecran de recuperare la nivel de aplicație (dacă se prăbușește tot).
export default function App() {
  return (
    <ErrorBoundary fallback={() => (
      <div className="wrap" style={{ textAlign: 'center' }}>
        <div className="title" style={{ marginTop: 60 }}>Hopa! 😅</div>
        <div className="sub">Jocul a întâmpinat o problemă neașteptată. Reîncarcă pagina ca să continui.</div>
        <button className="btn" style={{ width: '100%', marginTop: 18 }} onClick={() => window.location.reload()}>🔄 Reîncarcă jocul</button>
      </div>
    )}>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [game, setGame] = useState(null);
  const [net, setNet] = useState(null);   // Room online; null = local (un telefon)
  const [myId, setMyId] = useState(null); // id-ul jucătorului de pe ACEST telefon (online)
  const [conn, setConn] = useState(null); // id-urile conectate acum (null = necunoscut/local)

  // Sunete contextuale la schimbări de stare (carte trasă / câștig).
  const lastCardRef = useRef(null);
  const endedRef = useRef(false);
  useEffect(() => {
    if (!game) { lastCardRef.current = null; endedRef.current = false; return; }
    const cardKey = game.lastCard ? `${game.lastCard.text}` : null;
    if (cardKey && cardKey !== lastCardRef.current) { sfx.card(); lastCardRef.current = cardKey; }
    if (game.status === 'ended' && !endedRef.current) { sfx.win(); endedRef.current = true; }
  }, [game]);

  // RECONECTARE: la încărcare, dacă avem o sesiune online salvată, reintrăm în cameră.
  const reconnectedRef = useRef(false);
  useEffect(() => {
    if (reconnectedRef.current) return;
    reconnectedRef.current = true;
    const s = loadSession();
    if (!s) return;
    const room = new Room({
      code: s.code, myId: s.myId, isHost: !!s.isHost,
      initialState: s.isHost ? s.state : null,
      onState: setGame, joinName: s.isHost ? undefined : s.name,
    });
    setNet(room); setMyId(s.myId);
    if (s.isHost && s.state) setGame(s.state); // gazda își reia starea imediat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // urmărește cine e conectat acum (prezență)
  useEffect(() => {
    if (!net) { setConn(null); return; }
    net.onConn = (ids) => setConn(ids);
    return () => { if (net) net.onConn = () => {}; };
  }, [net]);

  // GAZDA salvează starea completă la fiecare schimbare (ca s-o poată relua la refresh).
  useEffect(() => {
    if (!net || !net.isHost || !game || game.status === 'ended') return;
    const name = game.players.find(p => p.id === myId)?.name;
    saveSession({ code: net.code, myId, isHost: true, name, state: game });
  }, [game, net, myId]);

  const goOnline = ({ net: n, myId: id }) => { setNet(n); setMyId(id); };
  const leave = () => { if (net) net.leave(); clearSession(); setNet(null); setMyId(null); setGame(null); setConn(null); };

  if (!game) return net
    ? <div className="wrap"><div className="title" style={{ marginTop: 40, textAlign: 'center' }}>Se reconectează…</div><div className="sub" style={{ textAlign: 'center' }}>Reintrăm în camera {net.code}. Dacă nu merge, pornește un joc nou.</div><button className="btn ghost" style={{ width: '100%', marginTop: 16 }} onClick={leave}>Renunță · joc nou</button></div>
    : <Setup onStart={setGame} onOnline={goOnline} bindState={setGame} />;
  if (game.status === 'lobby') return <Lobby game={game} setGame={setGame} net={net} myId={myId} conn={conn} onLeave={leave} />;
  if (game.status === 'ended') return <WinnerScreen game={game} onRestart={leave} />;
  return <Table game={game} setGame={setGame} net={net} myId={myId} conn={conn} onLeave={leave} />;
}

function WinnerScreen({ game, onRestart }) {
  const w = game.players.find(p => p.id === game.winnerId);
  return (
    <div className="wrap">
      <Confetti count={130} />
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

/* ---------------- SETUP (local hot-seat + online) ---------------- */
function Setup({ onStart, onOnline, bindState }) {
  const [tab, setTab] = useState('local'); // 'local' | 'online'
  const [names, setNames] = useState(['', '']);
  const [mode, setMode] = useState('classic');
  // online
  const [oName, setOName] = useState('');
  const [oCode, setOCode] = useState('');
  const [oMode, setOMode] = useState('classic');
  const [oErr, setOErr] = useState('');

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

  const createOnline = () => {
    const name = oName.trim();
    if (!name) { setOErr('Scrie-ți numele.'); return; }
    const code = randomCode();
    const id = newId();
    const g = createGame({ code, hostName: name, mode: oMode, hostId: id });
    const net = new Room({ code, myId: id, isHost: true, initialState: g, onState: bindState });
    saveSession({ code, myId: id, isHost: true, name, state: g });
    bindState(g);            // gazda vede lobby-ul imediat
    onOnline({ net, myId: id });
  };
  const joinOnline = () => {
    const name = oName.trim();
    const code = oCode.trim().toUpperCase();
    if (!name) { setOErr('Scrie-ți numele.'); return; }
    if (code.length < 4) { setOErr('Cod de cameră invalid.'); return; }
    const id = newId();
    const net = new Room({ code, myId: id, isHost: false, initialState: null, onState: bindState, joinName: name });
    saveSession({ code, myId: id, isHost: false, name });
    onOnline({ net, myId: id });
  };

  return (
    <div className="wrap">
      <div className="title">Anti<b>-Monopoly</b></div>
      <div className="sub">Competiție vs Cartel</div>

      <div className="rolePick" style={{ marginBottom: 14 }}>
        <button className={`roleBtn ${tab === 'local' ? 'comp on' : ''}`} onClick={() => setTab('local')}>📱 Un telefon<br /><small>pass &amp; play</small></button>
        <button className={`roleBtn ${tab === 'online' ? 'mono on' : ''}`} onClick={() => setTab('online')}>🌐 Online<br /><small>fiecare pe telefonul lui</small></button>
      </div>

      {tab === 'online' && (
        <>
          <div className="panel">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Numele tău</div>
            <input className="field" placeholder="Numele tău" value={oName} onChange={e => { setOName(e.target.value); setOErr(''); }} maxLength={20} style={{ width: '100%' }} />
            <div style={{ fontWeight: 900, margin: '16px 0 10px' }}>Mod de joc</div>
            <div className="rolePick">
              <button className={`roleBtn ${oMode === 'classic' ? 'comp on' : ''}`} onClick={() => setOMode('classic')}>Clasic<br /><small>ultimul rămas</small></button>
              <button className={`roleBtn ${oMode === 'short' ? 'mono on' : ''}`} onClick={() => setOMode('short')}>Scurt<br /><small>o tabără falimentează</small></button>
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={createOnline}>➕ Creează cameră</button>
          </div>
          <div className="panel">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Intră într-o cameră</div>
            <input className="field" placeholder="Cod cameră (ex: ABCD)" value={oCode} onChange={e => { setOCode(e.target.value.toUpperCase()); setOErr(''); }} maxLength={6} style={{ width: '100%', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 900 }} />
            <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={joinOnline}>Intră în cameră →</button>
          </div>
          {oErr && <p className="sub" style={{ color: 'var(--tax)', textAlign: 'center' }}>{oErr}</p>}
        </>
      )}

      {tab === 'local' && (
        <>

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
        </>
      )}
    </div>
  );
}

/* ---------------- LOBBY (confirmă roluri) ---------------- */
function Lobby({ game, setGame, net, myId, onLeave }) {
  const online = !!net;
  const isHost = online ? game.hostId === myId : true;
  const start = () => { if (online) net.dispatch('startGame'); else setGame(startGame(game)); };
  const enough = game.players.length >= 2;
  return (
    <div className="wrap">
      <div className="title">Anti<b>-Monopoly</b></div>
      <div className="sub">Camera pregătită · {game.mode === 'classic' ? 'mod Clasic' : 'mod Scurt'}</div>

      {online && (
        <div className="panel" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontWeight: 800, fontSize: 13 }}>Cod cameră — dă-l celorlalți</div>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '0.2em', margin: '6px 0 2px' }}>{game.code}</div>
          <div className="sub" style={{ margin: 0 }}>Ceilalți intră cu acest cod, de pe telefonul lor.</div>
        </div>
      )}

      <div className="panel">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Jucători & roluri {online ? `(${game.players.length})` : ''}</div>
        <div className="plist">
          {game.players.map(p => (
            <div className="pchip" key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              <b>{p.name}{p.id === myId ? ' (tu)' : ''}</b>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 800 }}>
                {p.role === 'competitor' ? '🟢 Competitor' : '🔵 Monopolist'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button className="btn" style={{ width: '100%' }} disabled={!enough} onClick={start}>
          {enough ? 'Pornește 🎲' : 'Așteaptă cel puțin 2 jucători…'}
        </button>
      ) : (
        <div className="sub" style={{ textAlign: 'center', fontWeight: 800 }}>Aștepți ca gazda să pornească jocul…</div>
      )}
      {online && <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={onLeave}>Ieși din cameră</button>}
    </div>
  );
}

/* ---------------- TABLA + JOCUL ---------------- */
// Pop-up cu cartonașul tras: card alb de joc, cu eticheta rolului și textul.
function CardPopup({ card, onClose }) {
  const isComp = card.role === 'competitor';
  const accent = isComp ? '#2E9E5B' : '#2E5BD8';
  const label = isComp ? 'Competitor' : 'Monopolist';
  const m = card.money;
  return (
    <div className="cardPopupBackdrop" onClick={onClose}>
      <div className="cardPopup" onClick={(e) => e.stopPropagation()}>
        <div className="cardPopupTag" style={{ color: accent, borderColor: accent }}>{label}</div>
        <p className="cardPopupText">{card.text}</p>
        {m != null && m !== 0 && (
          <div className="cardPopupAmount" style={{ color: m > 0 ? '#1E9E4E' : '#D23B3B' }}>
            {m > 0 ? '+' : '−'}€{Math.abs(m)}
          </div>
        )}
        <button className="btn cardPopupBtn" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

// Card „act de proprietate" la aterizarea pe ceva cumpărabil (proprietate/utilitate/transport).
function PropertyPopup({ info, canBuy, onBuy, onRefuse }) {
  const isProp = info.type === 'property';
  return (
    <div className="cardPopupBackdrop">
      <div className="deed">
        <div className="deedHead" style={{ background: info.color, color: isProp ? '#111' : info.headText }}>
          <div className="deedKind">{isProp ? (info.groupName || 'Proprietate') : info.kindLabel}</div>
          <div className="deedName">{isProp ? info.name : `${info.icon} ${info.name}`}</div>
        </div>
        <div className="deedBody">
          {isProp ? (
            <>
              <div className="deedRow deedRow2"><span>Preț teren</span><b>€{info.price}</b></div>
              <div className="deedRow deedRow2"><span>Cost casă</span><b>🟢 €{info.houseComp} · 🔵 €{info.houseMono}</b></div>
              <div className="deedRentsTitle">Chirii</div>
              <div className="deedRentHead"><span>🟢&nbsp;Comp.</span><span></span><span>🔵&nbsp;Mono.</span></div>
              {info.rents.map(r => (
                <div className="deedRentRow" key={r.label}>
                  <span className="cc">€{r.comp}</span><span className="ll">{r.label}</span><span className="mm">€{r.mono}</span>
                </div>
              ))}
              <div className="deedNote">Monopolistul: chiriile de sus sunt cu orașul complet (monopol). Ipotecă: €{info.mortgage} (½ preț).</div>
            </>
          ) : (
            <>
              <div className="deedBigIcon">{info.icon}</div>
              <div className="deedRow deedRow2"><span>Preț</span><b>€{info.price}</b></div>
              <div className="deedRow deedRow2"><span>Ipotecă</span><b>€{info.mortgage}</b></div>
              <div className="deedRentsTitle">Chirie = suma zarului ×</div>
              {info.rows.map(r => (
                <div className="deedFeeRow" key={r.count}><span>{r.count} {info.unitLabel}</span><b>× {r.mult}</b></div>
              ))}
              <div className="deedNote">Cu cât deții mai multe, cu atât chiria crește.</div>
            </>
          )}
          <div className="deedActions">
            <button className="btn" onClick={onBuy} disabled={!canBuy}>Cumpără · €{info.price}</button>
            <button className="btn ghost" onClick={onRefuse}>Refuz</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Înveliș generic pentru modale-card (licitație / schimb / construiește / gestionează / impozit).
// onClose opțional: dacă lipsește, modalul e „obligatoriu" (trebuie luată o decizie din interior).
function Modal({ children, onClose }) {
  return (
    <div className="cardPopupBackdrop" onClick={onClose || undefined}>
      <div className="modalHolder" onClick={(e) => e.stopPropagation()}>
        {onClose && <button className="modalClose" onClick={onClose} aria-label="Închide">✕</button>}
        {children}
      </div>
    </div>
  );
}

// Pop-up scurt pentru evenimente pe tablă (chirie, taxă, START, închisoare, fundație).
// Se închide singur după câteva secunde sau la atingere.
function EventPopup({ ev, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, ev.kind === 'monopoly' ? 3200 : ev.kind === 'rent' ? 2800 : 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.seq]);

  let icon = '❓', title = '', sub = '', amount = null, amountColor = '#111';
  let headColor = '#37474F', headText = '#fff';

  if (ev.kind === 'monopoly') {
    return (
      <div className="cardPopupBackdrop" onClick={onClose}>
        <div className="monoPop" onClick={(e) => e.stopPropagation()}>
          <div className="monoBurst">🏙️</div>
          <div className="monoTitle">MONOPOL!</div>
          <div className="monoSub"><b>{ev.who}</b> controlează tot <b>{ev.groupName}</b></div>
          <div className="monoHint">Chirii mult mai mari pe acest oraș 💰</div>
        </div>
      </div>
    );
  }

  if (ev.kind === 'rent') {
    const info = cardInfo(ev.idx);
    icon = info?.type === 'property' ? '🏠' : (info?.icon || '💸');
    headColor = info?.color || '#C0392B';
    headText = info?.type === 'property' ? '#111' : (info?.headText || '#fff');
    title = info?.name || 'Chirie';
    sub = `${ev.who} plătește chirie lui ${ev.owner}`;
    amount = `−€${ev.amount}`; amountColor = '#D23B3B';
  } else if (ev.kind === 'tax') {
    icon = '💶'; title = ev.name; sub = `${ev.who} plătește taxa`;
    amount = `−€${ev.amount}`; amountColor = '#D23B3B'; headColor = '#5A5A5A';
  } else if (ev.kind === 'start') {
    icon = '🎉'; title = 'START'; sub = `${ev.who} aterizează pe START`;
    amount = `+€${ev.amount}`; amountColor = '#1E9E4E'; headColor = '#2E9E5B';
  } else if (ev.kind === 'jail') {
    icon = '🚓'; title = 'La închisoare!';
    sub = ev.reason === 'doubles' ? `${ev.who} a dat 3 duble la rând` : `${ev.who} e trimis la închisoare`;
    headColor = '#37474F';
  } else if (ev.kind === 'fundatia') {
    icon = '🏛️'; title = 'Fundația Anti-Monopoly';
    sub = ev.amount > 0 ? `${ev.who} primește un ajutor` : ev.amount < 0 ? `${ev.who} contribuie la fundație` : `${ev.who} nu primește nimic`;
    amount = ev.amount === 0 ? null : ev.amount > 0 ? `+€${ev.amount}` : `−€${Math.abs(ev.amount)}`;
    amountColor = ev.amount >= 0 ? '#1E9E4E' : '#D23B3B'; headColor = '#7E6FBE';
  }

  return (
    <div className="cardPopupBackdrop" onClick={onClose}>
      <div className="evPop" onClick={(e) => e.stopPropagation()}>
        <div className="evPopHead" style={{ background: headColor, color: headText }}>
          <span className="evPopIcon">{icon}</span>
          <span className="evPopTitle">{title}</span>
        </div>
        <div className="evPopBody">
          <div className="evPopSub">{sub}</div>
          {amount && <div className="evPopAmount" style={{ color: amountColor }}>{amount}</div>}
        </div>
      </div>
    </div>
  );
}

function Table({ game, setGame, net, myId, conn, onLeave }) {
  const online = !!net;
  const isHost = online && game.hostId === myId;
  const offline = (pid) => online && conn && !conn.includes(pid);
  const [rolling, setRolling] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [shownDice, setShownDice] = useState(null);
  const [rollNonce, setRollNonce] = useState(0);
  const [immersive, setImmersive] = useState(false);
  // Pop-up animat cu cartonașul tras (apare când se trage o carte nouă — seq unic).
  const [cardPopup, setCardPopup] = useState(null);
  useEffect(() => {
    if (game.lastCard && game.lastCard.seq) setCardPopup(game.lastCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.lastCard?.seq]);
  // Pop-up pentru evenimente (chirie / taxă / START / închisoare / fundație).
  const [eventPopup, setEventPopup] = useState(null);
  useEffect(() => {
    if (game.lastEvent && game.lastEvent.seq) setEventPopup(game.lastEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.lastEvent?.seq]);

  // Pop-up-urile (cumpărare / eveniment / carte) apar ABIA după ce pionul termină mutarea.
  // La aruncare ascundem; apoi calculăm durata mutării (nr. căsuțe ÷ viteză) și le arătăm după.
  const [reveal, setReveal] = useState(true);
  const revealTimer = useRef(null);
  const lastPosRef = useRef(null);        // pozițiile pionilor înainte de mutarea curentă
  const rollSeqRef2 = useRef(game.rollSeq || 0);
  const blockReveal = () => { setReveal(false); clearTimeout(revealTimer.current); };
  useEffect(() => () => clearTimeout(revealTimer.current), []);
  // programează dezvăluirea pop-up-urilor după ce pionul s-a mutat (durată = nr. căsuțe / STEP_SPEED)
  useEffect(() => {
    if (lastPosRef.current === null) {
      lastPosRef.current = {}; game.players.forEach(p => { lastPosRef.current[p.id] = p.pos; });
    }
    const seq = game.rollSeq || 0;
    if (seq !== rollSeqRef2.current) {
      rollSeqRef2.current = seq;
      const mover = currentPlayer(game);
      const from = mover ? lastPosRef.current[mover.id] : undefined;
      let tiles = 0;
      if (mover && typeof from === 'number') {
        const fwd = (mover.pos - from + 40) % 40;
        tiles = (fwd >= 1 && fwd <= 12) ? fwd : 0; // >12 sau înapoi = teleport (instant)
      }
      const delay = tiles === 0 ? 250 : Math.round((tiles / PAWN_STEP_SPEED) * 1000) + 350;
      clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setReveal(true), delay);
    }
    const cur = {}; game.players.forEach(p => { cur[p.id] = p.pos; });
    lastPosRef.current = cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.rollSeq]);

  // ---- JUICE: monede / confetti / tremur / vibrație pe evenimente ----
  const [coinKey, setCoinKey] = useState(0);
  const [celebrate, setCelebrate] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  // Efectele „juice" (monede/shake/confetti) pornesc ODATĂ cu pop-up-urile, adică ABIA
  // când pionul s-a oprit (reveal === true), nu în timp ce se mișcă.
  const juiceRef = useRef({ ev: 0, card: 0 });
  useEffect(() => {
    if (!reveal) return;
    const ev = game.lastEvent;
    if (ev?.seq && ev.seq !== juiceRef.current.ev) {
      juiceRef.current.ev = ev.seq;
      if (ev.kind === 'monopoly') { setCelebrate(k => k + 1); setCoinKey(k => k + 1); haptic('heavy'); sfx.win(); }
      else if (ev.kind === 'start' || (ev.kind === 'fundatia' && ev.amount > 0)) { setCoinKey(k => k + 1); haptic('light'); }
      else if (ev.kind === 'rent' || ev.kind === 'tax') { setShaking(true); haptic('heavy'); }
      else if (ev.kind === 'jail' || (ev.kind === 'fundatia' && ev.amount < 0)) { setShaking(true); haptic('medium'); }
    }
    const c = game.lastCard;
    if (c?.seq && c.seq !== juiceRef.current.card) {
      juiceRef.current.card = c.seq;
      if (c.money > 0) { setCoinKey(k => k + 1); haptic('light'); }
      else if (c.money < 0) { setShaking(true); haptic('medium'); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, game.lastEvent?.seq, game.lastCard?.seq]);
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(0), 3200);
    return () => clearTimeout(t);
  }, [celebrate]);
  useEffect(() => {
    if (!shaking) return;
    const t = setTimeout(() => setShaking(false), 460);
    return () => clearTimeout(t);
  }, [shaking]);

  const wrapRef = useRef(null);
  const me = currentPlayer(game);
  const isMyTurn = online ? game.turn === myId : true;
  // dispatch: local aplică direct; online trimite gazdei (care aplică + retrimite starea).
  const dispatch = (fn, ...args) => {
    if (net) net.dispatch(fn, ...args);
    else { const f = ENGINE[fn]; if (f) setGame(g => f(g, ...args)); }
  };

  // ONLINE: gazda anunță zarul (faza 1) → animăm zarul; pionul se mută abia când sosește
  // starea de după (faza 2), ca la local (zar întâi, apoi mutare — nu simultan).
  useEffect(() => {
    if (!net) return;
    net.onRolling = (d) => { sfx.roll(); setShownDice(d); setRollNonce(n => n + 1); blockReveal(); };
    return () => { if (net) net.onRolling = null; };
  }, [net]);
  // ONLINE: deblochează butonul când sosește starea de după aruncare (faza 2).
  const onlineRollSeqRef = useRef(game.rollSeq || 0);
  useEffect(() => {
    if (!online) return;
    if ((game.rollSeq || 0) !== onlineRollSeqRef.current) {
      onlineRollSeqRef.current = game.rollSeq || 0;
      setRolling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.rollSeq]);

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
  useEffect(() => {
    document.body.classList.toggle('immersive-lock', immersive);
    return () => document.body.classList.remove('immersive-lock');
  }, [immersive]);

  const [muted, setMuted] = useState(false);
  const toggleMute = () => { const m = !muted; setMuted(m); sfx.setMuted(m); };

  const roll = () => {
    if (game.pending || game.debt || rolling) return;
    if (online) {
      if (!isMyTurn) return;
      setRolling(true);       // blochează până sosește starea de după (evită dublu-click)
      net.dispatch('__roll'); // gazda generează zarul; zarul se animează, apoi se mută pionul
      return;
    }
    const d = rollDicePair();
    sfx.roll();
    setShownDice(d);
    setRollNonce(n => n + 1);
    setRolling(true);
    blockReveal(); // ascunde pop-up-urile până se așază pionul
    // zarurile se rostogolesc ~1.5s + pauză de reveal ~0.8s, apoi pionul se mișcă
    setTimeout(() => { setGame(g => applyRoll(g, d)); setRolling(false); }, 2300);
  };
  const payJail = () => { sfx.pay(); haptic('light'); dispatch('applyPayJail', me.id); };
  const buy = () => { sfx.pay(); dispatch('applyBuy'); };
  const decline = () => dispatch('applyDeclineBuy');
  const endTurn = () => { setBuildOpen(false); setManageOpen(false); dispatch('applyEndTurn'); };
  const build = (idx) => { sfx.build(); dispatch('applyBuild', idx); };

  const pendingSq = game.pending?.type === 'buy' ? BOARD[game.pending.idx] : null;
  const buyInfo = pendingSq ? cardInfo(game.pending.idx) : null;
  const auction = game.pending?.type === 'auction' ? game.pending : null;
  const trade = game.pending?.type === 'trade' ? game.pending : null;
  const debt = game.debt || null;
  const rolledDouble = game.dice && game.dice[0] === game.dice[1] && !me?.inJail;
  // Poate arunca doar dacă n-a aruncat încă în tura asta SAU tocmai a dat dublă.
  const canRoll = !game.pending && !game.debt && !rolling && (!game.dice || rolledDouble);
  const buildable = me ? buildableFor(game, me.id) : [];
  const myProps = me ? BOARD.map((sq, i) => i).filter(i => game.ownership?.[i] === me.id) : [];

  // ONLINE: cine blochează jocul fiind deconectat (rândul lui / trebuie să paseze la licitație)?
  const hostOffline = offline(game.hostId);
  let blockedBy = null;
  if (online && conn) {
    if (auction) blockedBy = game.players.find(p => !p.bankrupt && !auction.passed.includes(p.id) && offline(p.id));
    else if (offline(game.turn)) blockedBy = game.players.find(p => p.id === game.turn);
  }

  return (
    <div className={`wrap game ${immersive ? 'immersive' : ''} ${shaking ? 'shake' : ''}`} ref={wrapRef}>
      <div className="topBtns">
        {online && <button className="fsBtn" onClick={onLeave} aria-label="Ieși din cameră">🚪</button>}
        <button className="fsBtn" onClick={() => setStandingsOpen(true)} aria-label="Averea jucătorilor">📊</button>
        <button className="fsBtn" onClick={toggleMute} aria-label={muted ? 'Activează sunetul' : 'Oprește sunetul'}>{muted ? '🔇' : '🔊'}</button>
        <button className="fsBtn" onClick={toggleImmersive} aria-label={immersive ? 'Ieși din ecran complet' : 'Ecran complet'}>{immersive ? '✕' : '⛶'}</button>
      </div>
      <CoinShower trigger={coinKey} />
      {celebrate > 0 && <Confetti count={90} />}
      <ErrorBoundary fallback={(reset) => (
        <div className="canvas3d" style={{ display: 'grid', placeItems: 'center', gap: 10, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
          <div>Tabla 3D a avut o problemă.<br />Jocul e în continuare activ.</div>
          <button className="btn" style={{ maxWidth: 220 }} onClick={reset}>🔄 Reîncarcă tabla</button>
        </div>
      )}>
        <Suspense fallback={<div className="canvas3d" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Se încarcă tabla 3D…</div>}>
          <Board3D game={game} dice={shownDice ?? game.dice} rollNonce={rollNonce} immersive={immersive} />
        </Suspense>
      </ErrorBoundary>
      {standingsOpen && <StandingsModal game={game} myId={myId} conn={conn} onClose={() => setStandingsOpen(false)} />}

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

        {reveal && cardPopup && <CardPopup card={cardPopup} onClose={() => setCardPopup(null)} />}
        {reveal && !cardPopup && eventPopup && <EventPopup ev={eventPopup} onClose={() => setEventPopup(null)} />}

        {/* ONLINE: jucător deconectat care blochează jocul → gazda poate sări peste */}
        {blockedBy && (
          <div className="offlineBanner">
            <b>📵 {blockedBy.name} s-a deconectat.</b> {isHost ? 'Poți sări peste el ca să continue jocul.' : 'Așteptăm gazda să continue…'}
            {isHost && (
              <button className="btn" style={{ width: '100%', marginTop: 8 }}
                onClick={() => dispatch('applyForceEndTurn', blockedBy.id)}>⏭️ Sări peste {blockedBy.name}</button>
            )}
          </div>
        )}
        {!blockedBy && hostOffline && (
          <div className="offlineBanner"><b>📵 Gazda s-a deconectat.</b> Așteptăm să revină… (jocul continuă când gazda se reconectează)</div>
        )}

        {debt && (
          <div className="debtBanner">
            <b>💸 {me.name} datorează €{debt.amount}.</b> Fă rost de bani (ipotecă / vinde case) sau declară faliment.
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setManageOpen(true)}>🏦 Gestionează</button>
            {mustBankrupt(game, me.id) && (
              <button className="btn ghost" style={{ width: '100%', marginTop: 6, color: 'var(--tax)', borderColor: 'var(--tax)' }}
                onClick={() => dispatch('applyDeclareBankrupt')}>💥 Declar faliment</button>
            )}
          </div>
        )}

        {online && !isMyTurn && !auction && !trade ? (
          <div className="actions">
            <div className="sub" style={{ width: '100%', textAlign: 'center', fontWeight: 800, margin: 0 }}>
              Rândul lui {currentPlayer(game)?.name}… ⏳
            </div>
          </div>
        ) : !debt && !pendingSq && !auction && !trade ? (
          <>
            {me?.inJail && !game.dice && (
              <div className="jailBanner">
                🔒 <b>Ești la închisoare.</b> Aruncă și speră la o dublă, sau plătește €50 ca să ieși acum.
                <button className="btn" style={{ width: '100%', marginTop: 8 }}
                  onClick={payJail} disabled={me.money < 50 || rolling}>
                  💵 Plătește €50 și ieși
                </button>
              </div>
            )}
            <div className="actions">
              {(!game.dice || rolledDouble) && (
                <button className="btn" onClick={roll} disabled={!canRoll}>
                  {rolling ? '…' : rolledDouble ? 'Dublă! Mai arunci 🎲' : me?.inJail ? '🎲 Aruncă (dublă = ieși)' : '🎲 Aruncă zarul'}
                </button>
              )}
              {game.dice && !rolledDouble && <button className="btn" onClick={endTurn}>Termină tura →</button>}
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              {buildable.length > 0 && (
                <button className="btn ghost" onClick={() => { setBuildOpen(true); setManageOpen(false); }}>
                  🏠 Construiește ({buildable.length})
                </button>
              )}
              <button className="btn ghost" onClick={() => { setManageOpen(true); setBuildOpen(false); }}>🏦 Gestionează</button>
            </div>
          </>
        ) : null}

        {/* ---- Card „act de proprietate" (Cumpără) — doar jucătorul curent decide, după ce s-a oprit pionul ---- */}
        {reveal && pendingSq && buyInfo && (!online || isMyTurn) && (
          <PropertyPopup info={buyInfo} canBuy={me.money >= pendingSq.price} onBuy={buy} onRefuse={decline} />
        )}

        {/* ---- Licitație ---- */}
        {auction && (
          <Modal>
            <AuctionPanel game={game} dispatch={dispatch} auction={auction} online={online} myId={myId} />
          </Modal>
        )}

        {/* ---- Schimb ---- */}
        {trade && (
          <Modal>
            <TradePanel game={game} dispatch={dispatch} trade={trade} online={online} myId={myId} />
          </Modal>
        )}

        {/* ---- Construiește ---- */}
        {buildOpen && (
          <Modal onClose={() => setBuildOpen(false)}>
            <div className="panel" style={{ marginBottom: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>🏠 Construiește</div>
              {buildable.length === 0 ? (
                <p className="sub" style={{ margin: 0, textAlign: 'left' }}>Nu poți construi acum.</p>
              ) : (
                <>
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
                </>
              )}
            </div>
          </Modal>
        )}

        {/* ---- Gestionează (ipotecă / vânzare case / schimb) ---- */}
        {manageOpen && (
          <Modal onClose={() => setManageOpen(false)}>
            <ManagePanel game={game} dispatch={dispatch} me={me} myProps={myProps} />
          </Modal>
        )}

        <div className="moneyList">
          {game.players.map(p => (
            <span key={p.id} className={`moneyChip ${p.id === game.turn ? 'turn' : ''} ${offline(p.id) ? 'off' : ''}`}>
              <span className="dot" style={{ background: p.color }} /> {p.name}{p.id === myId ? ' (tu)' : ''}: €{p.money}{offline(p.id) ? ' 📵' : ''}
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
function AuctionPanel({ game, dispatch, auction, online, myId }) {
  const sq = BOARD[auction.idx];
  const eligible = game.players.filter(p => !p.bankrupt && !auction.passed.includes(p.id));
  const bid = (pid, amount) => dispatch('applyBid', pid, amount);
  const pass = (pid) => dispatch('applyPassAuction', pid);
  const high = auction.highBid;
  const highName = auction.highBidderId && game.players.find(p => p.id === auction.highBidderId)?.name;
  // ONLINE: fiecare telefon vede DOAR controalele lui (nu poate licita pentru alții).
  const controls = online ? eligible.filter(p => p.id === myId) : eligible;
  const active = game.players.filter(p => !p.bankrupt);
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>🔨 Licitație: {sq.name}</div>
      <p className="sub" style={{ textAlign: 'left', margin: '0 0 10px' }}>
        Ofertă maximă: <b style={{ color: 'var(--ink)' }}>€{high}</b>{highName && ` · ${highName}`}
      </p>
      <div className="plist">
        {controls.map(p => (
          <div className="pchip" key={p.id}>
            <span className="dot" style={{ background: p.color }} />
            <b>{p.name}{online && p.id === myId ? ' (tu)' : ''}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>€{p.money}</span>
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
      {online && controls.length === 0 && (
        <p className="sub" style={{ textAlign: 'center', margin: '2px 0 0', fontWeight: 800 }}>
          {auction.passed.includes(myId) ? 'Ai pasat. Aștepți finalul licitației…' : 'Aștepți licitația…'}
        </p>
      )}
      {online && (
        <div className="moneyList" style={{ marginTop: 10 }}>
          {active.map(p => (
            <span key={p.id} className={`moneyChip ${auction.highBidderId === p.id ? 'turn' : ''}`}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}: {auction.passed.includes(p.id) ? 'a pasat' : auction.highBidderId === p.id ? `€${high} ✋` : 'licitează'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Schimb: oferta primită ---- */
function TradePanel({ game, dispatch, trade, online, myId }) {
  const from = game.players.find(p => p.id === trade.fromId);
  const to = game.players.find(p => p.id === trade.toId);
  const names = (idxs) => idxs.map(i => BOARD[i].name).join(', ') || '—';
  const canDecide = !online || myId === trade.toId; // online: doar cel care primește oferta decide
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>🤝 {from.name} propune un schimb lui {to.name}</div>
      <div className="pchip" style={{ display: 'block' }}>
        <div><b>{from.name}</b> dă: {names(trade.giveProps)}{trade.giveMoney ? ` + €${trade.giveMoney}` : ''}</div>
        <div style={{ marginTop: 4 }}><b>{to.name}</b> dă: {names(trade.getProps)}{trade.getMoney ? ` + €${trade.getMoney}` : ''}</div>
      </div>
      {canDecide ? (
        <>
          <p className="sub" style={{ margin: '8px 0' }}>Decide {online ? 'tu' : to.name}:</p>
          <div className="actions">
            <button className="btn" onClick={() => dispatch('applyAcceptTrade')}>Accept</button>
            <button className="btn ghost" onClick={() => dispatch('applyDeclineTrade')}>Refuz</button>
          </div>
        </>
      ) : (
        <p className="sub" style={{ margin: '10px 0 0', textAlign: 'center', fontWeight: 800 }}>Aștepți ca {to.name} să decidă…</p>
      )}
    </div>
  );
}

/* ---- Gestionare: ipotecă / vânzare case / propunere schimb ---- */
function ManagePanel({ game, dispatch, me, myProps }) {
  const [tradeWith, setTradeWith] = useState(null);
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);
  const [giveMoney, setGiveMoney] = useState('');
  const [getMoney, setGetMoney] = useState('');

  const mortgage = (i) => dispatch('applyMortgage', i);
  const unmortgage = (i) => dispatch('applyUnmortgage', i);
  const sell = (i) => dispatch('applySellHouse', i);

  const others = game.players.filter(p => p.id !== me.id && !p.bankrupt);
  const theirProps = tradeWith
    ? BOARD.map((s, i) => i).filter(i => game.ownership?.[i] === tradeWith && (game.buildings?.[i] || 0) === 0)
    : [];
  const myTradeable = myProps.filter(i => (game.buildings?.[i] || 0) === 0);
  const toggle = (arr, set, i) => set(arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i]);
  const propose = () => {
    dispatch('proposeTrade', {
      toId: tradeWith, giveProps: give, getProps: get,
      giveMoney: Number(giveMoney) || 0, getMoney: Number(getMoney) || 0,
    });
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
