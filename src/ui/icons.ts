import type { CategoryId } from '../types';

const PATHS: Record<CategoryId, string> = {
  notebook: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>',
  desktop: '<rect x="5" y="3" width="11" height="18" rx="1.5"/><path d="M8 7h5M10.5 17h.01"/>',
  celular: '<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 18h2"/>',
  tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M11 18h2"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  impressora:
    '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  rede: '<rect x="3" y="15" width="18" height="5" rx="1.5"/><path d="M7 17.5h.01M11 17.5h.01M8.5 12a5 5 0 0 1 7 0M6 9.5a8.5 8.5 0 0 1 12 0"/>',
  periferico: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 3v6"/>',
  servidor:
    '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
  outro: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
};

export function categoryIcon(category: CategoryId): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[category]}</svg>`;
}
