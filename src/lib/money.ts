/** Alle belop lagres som heltall i ore. */

const formatter = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatAmount(ore: number): string {
  const kroner = ore / 100;
  return `${formatter.format(kroner)} kr`;
}

export function kroner(amount: number): number {
  return Math.round(amount * 100);
}
