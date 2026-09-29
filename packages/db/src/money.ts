export type Halere = number;

export function korunyToHalere(koruny: number): Halere {
  return Math.round(koruny * 100);
}

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatCzk(halere: Halere): string {
  if (!Number.isInteger(halere)) {
    throw new Error(`Částka musí být celé číslo v haléřích, dostal jsem ${halere}`);
  }
  return czk.format(halere / 100);
}
