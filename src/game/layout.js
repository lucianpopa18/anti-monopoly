// Poziția fiecărei căsuțe (0..39) pe o grilă 11×11 (perimetru).
// START jos-dreapta; se merge spre STÂNGA pe jos, SUS pe stânga, DREAPTA pe sus,
// JOS pe dreapta (sensul clasic de deplasare).
export function gridPos(index) {
  if (index <= 10) return { row: 11, col: 11 - index, side: 'bottom' };          // 0..10 (jos, dreapta→stânga)
  if (index <= 20) return { row: 11 - (index - 10), col: 1, side: 'left' };       // 11..20 (stânga, jos→sus)
  if (index <= 30) return { row: 1, col: 1 + (index - 20), side: 'top' };         // 21..30 (sus, stânga→dreapta)
  return { row: 1 + (index - 30), col: 11, side: 'right' };                        // 31..39 (dreapta, sus→jos)
}

export function isCorner(index) {
  return index === 0 || index === 10 || index === 20 || index === 30;
}
