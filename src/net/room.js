import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import {
  addPlayer, setRole, startGame, applyRoll, applyBuy, applyDeclineBuy, applyEndTurn,
  applyBuild, applyBid, applyPassAuction, applyAcceptTrade, applyDeclineTrade,
  applyMortgage, applyUnmortgage, applySellHouse, proposeTrade, applyDeclareBankrupt, rollDicePair,
  applyForceEndTurn,
} from '../game/engine.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 20 } },
  auth: { persistSession: false },
});

// Cât timp „cad" zarurile înainte ca pionul să se miște (ca la local: zar întâi, apoi mutare).
const ROLL_REVEAL_MS = 1800;

// Acțiunile permise, apelate prin nume (ca să le putem trimite pe rețea).
const ACTIONS = {
  setRole, startGame, applyBuy, applyDeclineBuy, applyEndTurn, applyBuild,
  applyBid, applyPassAuction, applyAcceptTrade, applyDeclineTrade, applyMortgage, applyUnmortgage,
  applySellHouse, proposeTrade, applyDeclareBankrupt, applyForceEndTurn,
};

// Cameră ONLINE, host-autoritar: gazda ține starea, aplică acțiunile și o trimite
// la toți prin Realtime broadcast (mesaje efemere, fără tabele). Ceilalți trimit
// cereri de acțiune gazdei și primesc starea înapoi.
export class Room {
  constructor({ code, myId, isHost, initialState, onState, onConn, joinName }) {
    this.code = code; this.myId = myId; this.isHost = isHost; this.joinName = joinName;
    this.state = initialState || null;
    this.onState = onState || (() => {});
    this.onConn = onConn || (() => {});
    this.onRolling = null;      // setat de UI: animă zarul înainte ca pionul să se miște
    this._rollTimer = null;
    this.channel = supabase.channel('am-' + code, {
      config: { broadcast: { self: false }, presence: { key: myId } },
    });

    this.channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      this.state = payload.state; this.onState(payload.state);
    });
    // Faza 1 a aruncării: doar zarul (animație pe toate telefoanele); mutarea vine în starea de după.
    this.channel.on('broadcast', { event: 'rolling' }, ({ payload }) => {
      if (this.onRolling) this.onRolling(payload.dice);
    });
    if (isHost) {
      this.channel.on('broadcast', { event: 'action' }, ({ payload }) => this._handle(payload));
    }
    this.channel.on('presence', { event: 'sync' }, () => {
      const st = this.channel.presenceState();
      this.onConn(Object.values(st).flat().map(x => x.id));
    });

    this.channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await this.channel.track({ id: myId, isHost });
      if (isHost) { this._broadcast(); return; }      // gazda trimite starea inițială
      this._send('action', { fn: '__hello', args: [], byId: myId });       // cere starea
      if (this.joinName) this._send('action', { fn: '__join', args: [this.joinName], byId: myId }); // se adaugă în joc
    });
  }

  _send(event, payload) { this.channel.send({ type: 'broadcast', event, payload }); }
  _broadcast() { if (this.state) this._send('state', { state: this.state }); }
  _apply(next) { this.state = next; this.onState(next); if (this.isHost) this._broadcast(); }

  // Verifică dacă jucătorul `byId` are DREPTUL să ceară acțiunea `fn` acum.
  // (Panourile sunt comune, dar pe online fiecare telefon poate acționa doar pentru el.)
  _authorized(fn, args, byId) {
    const s = this.state;
    // acțiuni care aparțin jucătorului al cărui rând este
    const CURRENT_ONLY = new Set([
      'applyBuy', 'applyDeclineBuy', 'applyEndTurn', 'applyBuild',
      'applyMortgage', 'applyUnmortgage', 'applySellHouse', 'proposeTrade', 'applyDeclareBankrupt',
    ]);
    if (CURRENT_ONLY.has(fn)) return byId === s.turn;
    // la licitație poți licita/pasa DOAR pentru tine (nu pentru alt jucător)
    if (fn === 'applyBid' || fn === 'applyPassAuction') return args[0] === byId;
    // schimbul e decis DOAR de cel care primește oferta
    if (fn === 'applyAcceptTrade' || fn === 'applyDeclineTrade') return s.pending?.type === 'trade' && byId === s.pending.toId;
    if (fn === 'startGame') return byId === s.hostId; // doar gazda pornește
    if (fn === 'applyForceEndTurn') return byId === s.hostId; // doar gazda poate sări peste un deconectat
    return true; // setRole etc. (lobby)
  }

  // GAZDA procesează o cerere de acțiune (de la ea sau de la un alt jucător).
  _handle({ fn, args = [], byId }) {
    if (!this.isHost || !this.state) return;
    try {
      if (fn === '__hello') { this._broadcast(); return; }
      if (fn === '__join') { this._apply(addPlayer(this.state, args[0], args[1], byId)); return; }
      if (fn === '__roll') {
        if (byId !== this.state.turn) return;   // doar jucătorul de pe rând aruncă
        if (this._rollTimer) return;            // aruncare deja în curs (anti dublu-click)
        const d = rollDicePair();
        // Faza 1: anunță zarul tuturor (animație) + animă local la gazdă.
        this._send('rolling', { dice: d });
        if (this.onRolling) this.onRolling(d);
        // Faza 2: după ce cad zarurile, aplică mutarea și trimite starea.
        this._rollTimer = setTimeout(() => {
          this._rollTimer = null;
          this._apply(applyRoll(this.state, d));
        }, ROLL_REVEAL_MS);
        return;
      }
      const f = ACTIONS[fn];
      if (f && this._authorized(fn, args, byId)) this._apply(f(this.state, ...args));
    } catch (e) { /* acțiune invalidă → ignorăm */ }
  }

  // UI-ul local cere o acțiune. Gazda o aplică direct; ceilalți o trimit gazdei.
  dispatch(fn, ...args) {
    if (this.isHost) this._handle({ fn, args, byId: this.myId });
    else this._send('action', { fn, args, byId: this.myId });
  }

  // Gazda setează starea direct (ex: la creare/lobby local).
  setHostState(next) { if (this.isHost) this._apply(next); }

  leave() { clearTimeout(this._rollTimer); try { supabase.removeChannel(this.channel); } catch { /* */ } }
}

export function newId() { return 'p_' + Math.random().toString(36).slice(2, 9); }
