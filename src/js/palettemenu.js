// Menu entries every palette gets, wherever it is shown (studio card, book page,
// deck blade, full-screen viewer). The heavier dialogs load only when chosen.
import { ICONS } from './ui.js';

export function paletteMoreItems(p) {
  return [
    { label: 'Preview on artwork', icon: ICONS.art, onSelect: async () => (await import('./contextui.js')).openContext(p) },
    { label: 'Share (link, code, QR)', icon: ICONS.share, onSelect: async () => (await import('./shareui.js')).openShare(p) },
    { label: 'Contrast checker', icon: ICONS.contrast, onSelect: async () => (await import('./contrastui.js')).openContrast(p) },
    { label: 'Print & cut…', icon: ICONS.print, onSelect: async () => (await import('./printui.js')).openPrint({ palettes: [p] }) },
  ];
}
