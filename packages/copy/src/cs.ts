/**
 * Všechny uživatelské texty (česky). Nová obrazovka = nové klíče tady,
 * ne texty rozházené v komponentách.
 */
export const cs = {
  common: {
    save: "Uložit",
    cancel: "Zrušit",
    back: "Zpět",
    next: "Pokračovat",
    loading: "Načítám…",
  },
  home: {
    tagline: "Operační systém pro váš salon",
    description:
      "Rezervace, klienti, platby a připomínky na jednom místě. Systém pracuje za vás.",
  },
} as const;

export type Copy = typeof cs;
