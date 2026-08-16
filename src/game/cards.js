// ================= CĂRȚI Competitor / Monopolist =================
// Efecte: { money }, { moveTo }, { moveBy }, { jail }, { getOutFree }, { collectEach }
// Cele două pachete au „filosofii" diferite: Competitorul = piață corectă / câștiguri
// modeste; Monopolistul = mize mari, dominare, dar și riscuri mai dure.

export const COMPETITOR_CARDS = [
  { text: 'Piața liberă îți zâmbește. Încasezi €100.', money: 100 },
  { text: 'Un client fidel te recomandă. Încasezi €60.', money: 60 },
  { text: 'Consiliul Concurenței te premiază pentru joc corect. €90.', money: 90 },
  { text: 'Investești în cartier. Plătești €50.', money: -50 },
  { text: 'Reducere de taxe pentru micii antreprenori. €40.', money: 40 },
  { text: 'Fiecare concurent îți plătește €20 pentru o idee bună.', collectEach: 20 },
  { text: 'Amendă mică pentru întârziere. Plătești €30.', money: -30 },
  { text: 'Mergi înainte 3 căsuțe.', moveBy: 3 },
  { text: 'Zi liberă — mergi la START și încasează.', moveTo: 0 },
  { text: 'Control neanunțat. Du-te la Închisoare.', jail: true },
  { text: 'Ai un aliat la Consiliu: Ieși liber din închisoare (păstrează cartea).', getOutFree: true },
  { text: 'Bonus de fidelitate. Încasezi €50.', money: 50 },
];

export const MONOPOLIST_CARDS = [
  { text: 'Cartelul prosperă. Încasezi €200.', money: 200 },
  { text: 'Dividende din monopol. Încasezi €150.', money: 150 },
  { text: 'Absorbi un concurent: fiecare jucător îți plătește €40.', collectEach: 40 },
  { text: 'Anchetă antitrust. Plătești €150.', money: -150 },
  { text: 'Scandal public. Plătești €90.', money: -90 },
  { text: 'Extindere agresivă. Plătești €100.', money: -100 },
  { text: 'Retragi profituri. Încasezi €130.', money: 130 },
  { text: 'Mită descoperită. Du-te la Închisoare.', jail: true },
  { text: 'Avocat bun: Ieși liber din închisoare (păstrează cartea).', getOutFree: true },
  { text: 'Mergi la START și încasează.', moveTo: 0 },
  { text: 'Lovitură de piață. Încasezi €110.', money: 110 },
  { text: 'Penalizare de dominare. Plătești €120.', money: -120 },
];

export function deckFor(role) {
  return role === 'monopolist' ? MONOPOLIST_CARDS : COMPETITOR_CARDS;
}
