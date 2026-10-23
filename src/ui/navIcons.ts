const svg = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Ícones das telas, usados no menu de baixo e nos atalhos da tela inicial. */
export const SECTION_ICONS = {
  inicio: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>'),
  inventario: svg('<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>'),
  quebras: svg(
    '<path d="M14.5 6.5a4 4 0 0 0 4.9 4.9l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4a4 4 0 0 0-1.9-1.9z"/>',
  ),
  acessos: svg(
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5a3 3 0 0 1 0 6M18 14.8c1.8.6 3 2.3 3 5.2"/>',
  ),
} as const;
