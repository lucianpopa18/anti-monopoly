// ================= ANTI-MONOPOLY · TABLA =================
// Cele 40 de căsuțe, exact ca pe tabla lui Luk (ediția „Jocul secolului 21").
// Index 0..39 (colțuri la 0/10/20/30). Prețurile sunt cele reale de pe tablă.
// Chiriile de bază sunt calculate proporțional (se rafinează la Faza 2 cu roluri).

// Grupurile de orașe (culori pentru UI).
export const GROUPS = {
  roma:      { name: 'Roma',      color: '#8D6E63' }, // maro
  bucuresti: { name: 'București', color: '#42A5F5' }, // albastru deschis
  madrid:    { name: 'Madrid',    color: '#EC407A' }, // roz
  amsterdam: { name: 'Amsterdam', color: '#FF7043' }, // portocaliu
  paris:     { name: 'Paris',     color: '#EF5350' }, // roșu
  bruxelles: { name: 'Bruxelles', color: '#FFCA28' }, // galben
  londra:    { name: 'Londra',    color: '#66BB6A' }, // verde
  atena:     { name: 'Atena',     color: '#5C6BC0' }, // albastru închis
};

// Chirie de bază proporțională cu prețul (rotunjită frumos). Provizoriu (Faza 1).
const baseRent = (price) => Math.max(2, Math.round(price / 10));

const city = (name, group, price) => ({
  type: 'property', kind: 'city', name, group, price, baseRent: baseRent(price),
});
const transport = (name) => ({ type: 'transport', name, price: 200 });
const utility = (name) => ({ type: 'utility', name, price: 150 });

export const BOARD = [
  /* 0  */ { type: 'corner', kind: 'start', name: 'START' },
  /* 1  */ city('Corso Imperiale', 'roma', 60),
  /* 2  */ { type: 'card', name: 'Competitor / Monopolist' },
  /* 3  */ city('Via Appia', 'roma', 60),
  /* 4  */ { type: 'tax', name: 'Impozit pe venit', amount: 200, kind: 'income' },
  /* 5  */ transport('Transport Aerian'),
  /* 6  */ city('Calea Victoriei', 'bucuresti', 100),
  /* 7  */ { type: 'card', name: 'Competitor / Monopolist' },
  /* 8  */ city('Bulevardul Magheru', 'bucuresti', 100),
  /* 9  */ city('Șoseaua Kiseleff', 'bucuresti', 120),
  /* 10 */ { type: 'corner', kind: 'jail', name: 'Închisoare / Vizită' },
  /* 11 */ city('Plaza Mayor', 'madrid', 140),
  /* 12 */ utility('Compania de Electricitate'),
  /* 13 */ city('Gran Vía', 'madrid', 140),
  /* 14 */ city('Paseo de la Castellana', 'madrid', 160),
  /* 15 */ transport('Transport Feroviar'),
  /* 16 */ city('Damrak', 'amsterdam', 180),
  /* 17 */ { type: 'card', name: 'Competitor / Monopolist' },
  /* 18 */ city('Kalverstraat', 'amsterdam', 180),
  /* 19 */ city('Leidsestraat', 'amsterdam', 200),
  /* 20 */ { type: 'corner', kind: 'fundatia', name: 'Fundația Anti-Monopoly' },
  /* 21 */ city('Rue de la Paix', 'paris', 220),
  /* 22 */ { type: 'card', name: 'Competitor / Monopolist' },
  /* 23 */ city('Avenue des Champs-Élysées', 'paris', 220),
  /* 24 */ city('Boulevard Saint-Germain', 'paris', 240),
  /* 25 */ transport('Transport Maritim'),
  /* 26 */ city('Grand Place', 'bruxelles', 260),
  /* 27 */ city('Rue Neuve', 'bruxelles', 260),
  /* 28 */ utility('Compania de Gaz'),
  /* 29 */ city('Avenue Louise', 'bruxelles', 280),
  /* 30 */ { type: 'corner', kind: 'gotojail', name: 'Consiliul Concurenței' },
  /* 31 */ city('Piccadilly', 'londra', 300),
  /* 32 */ city('Regent Street', 'londra', 300),
  /* 33 */ { type: 'card', name: 'Competitor / Monopolist' },
  /* 34 */ city('Oxford Street', 'londra', 320),
  /* 35 */ transport('Transport Rutier'),
  /* 36 */ { type: 'card', name: 'Competitor / Monopolist' },
  /* 37 */ city('La Plaka', 'atena', 350),
  /* 38 */ { type: 'tax', name: 'Impozit suplimentar', amount: 75, kind: 'extra' },
  /* 39 */ city('Sintagma', 'atena', 400),
];

// Poziții-cheie.
export const START = 0;
export const JAIL = 10;
export const FUNDATIA = 20;
export const GOTOJAIL = 30;

// Câte proprietăți are fiecare grup (pentru monopol).
export const GROUP_SIZE = BOARD.reduce((acc, sq) => {
  if (sq.type === 'property') acc[sq.group] = (acc[sq.group] || 0) + 1;
  return acc;
}, {});

// Indexurile proprietăților dintr-un grup.
export function groupIndexes(group) {
  const out = [];
  BOARD.forEach((sq, i) => { if (sq.type === 'property' && sq.group === group) out.push(i); });
  return out;
}
