import { BOARD, GROUPS } from './board.js';

// Coeficienții din motor (chiria = suma zarului × coef, după câte companii deții).
const TRANSPORT_COEF = { 1: 4, 2: 8, 3: 12, 4: 20 };
const UTILITY_COEF = { 1: 4, 2: 10 };

function transportIcon(name) {
  if (/aerian/i.test(name)) return '✈️';
  if (/feroviar/i.test(name)) return '🚆';
  if (/maritim/i.test(name)) return '🚢';
  if (/rutier/i.test(name)) return '🚌';
  return '🚚';
}

// Datele pentru cardul „act de proprietate" al unei căsuțe cumpărabile.
// Valorile sunt cele REALE din motor (chirii calculate), afișate în formatul din poze.
export function cardInfo(idx) {
  const sq = BOARD[idx];
  if (!sq) return null;
  const price = sq.price || 0;
  const mortgage = Math.round(price / 2);

  if (sq.type === 'property') {
    const base = sq.baseRent;
    const color = GROUPS[sq.group]?.color || '#8a8a8a';
    const groupName = GROUPS[sq.group]?.name || '';
    const labels = ['Fără case', '1 casă', '2 case', '3 case', '4 case'];
    const rents = labels.map((label, h) => ({
      label,
      comp: base * (1 + h),         // Competitor: baza × (1 + case)
      mono: base * 2 * (1 + h),     // Monopolist (cu oraș complet): dublu
    }));
    return { type: 'property', name: sq.name, groupName, color, price, mortgage,
      houseComp: Math.round(price / 2), houseMono: price, base, rents };
  }

  if (sq.type === 'transport' || sq.type === 'utility') {
    const isUtil = sq.type === 'utility';
    const coef = isUtil ? UTILITY_COEF : TRANSPORT_COEF;
    const icon = isUtil ? (/gaz/i.test(sq.name) ? '🔥' : '⚡') : transportIcon(sq.name);
    const rows = Object.entries(coef).map(([count, mult]) => ({ count: Number(count), mult }));
    return { type: sq.type, isUtil, name: sq.name, icon,
      color: isUtil ? '#E7D9A8' : '#2C3E50', headText: isUtil ? '#3a3320' : '#fff',
      kindLabel: isUtil ? 'Utilitate' : 'Companie de transport',
      price, mortgage, rows,
      unitLabel: isUtil ? 'deținute' : 'companii' };
  }
  return null;
}
