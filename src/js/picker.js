// Circular HSV color wheel with a brightness slider.
import { clamp, wrapHue, hexToHsv, hsvToHex } from './color.js';

export class ColorWheel {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} handle  draggable marker element
   * @param {HTMLInputElement} brightness range input 0–100
   * @param {(hex: string, source: string) => void} onChange
   */
  constructor(canvas, handle, brightness, onChange) {
    this.canvas = canvas;
    this.handle = handle;
    this.brightness = brightness;
    this.onChange = onChange;
    this.hsv = { h: 200, s: 0.75, v: 0.9 };
    this.dragging = false;
    this.draw();
    this.bind();
  }

  draw() {
    const { canvas } = this;
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r, dy = y - r;
        const d = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (d > r) { img.data[i + 3] = 0; continue; }
        const h = wrapHue((Math.atan2(dy, dx) * 180) / Math.PI + 90);
        const hex = hsvToHex({ h, s: d / r, v: 1 });
        const n = parseInt(hex.slice(1), 16);
        img.data[i] = (n >> 16) & 255;
        img.data[i + 1] = (n >> 8) & 255;
        img.data[i + 2] = n & 255;
        // Soft anti-aliased edge.
        img.data[i + 3] = d > r - 1.5 ? Math.round(255 * (r - d) / 1.5) : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  bind() {
    const move = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const r = rect.width / 2;
      const dx = e.clientX - rect.left - r;
      const dy = e.clientY - rect.top - r;
      this.hsv.h = wrapHue((Math.atan2(dy, dx) * 180) / Math.PI + 90);
      this.hsv.s = clamp(Math.sqrt(dx * dx + dy * dy) / r);
      this.update('wheel');
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) move(e); });
    const stop = () => { if (this.dragging) { this.dragging = false; this.update('wheel-end'); } };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);

    this.canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') this.hsv.h = wrapHue(this.hsv.h - step);
      else if (e.key === 'ArrowRight') this.hsv.h = wrapHue(this.hsv.h + step);
      else if (e.key === 'ArrowUp') this.hsv.s = clamp(this.hsv.s + step / 100);
      else if (e.key === 'ArrowDown') this.hsv.s = clamp(this.hsv.s - step / 100);
      else return;
      e.preventDefault();
      this.update('wheel-end');
    });

    this.brightness.addEventListener('input', () => {
      this.hsv.v = Number(this.brightness.value) / 100;
      this.update('brightness');
    });
    this.brightness.addEventListener('change', () => this.update('wheel-end'));
  }

  placeHandle() {
    const t = ((this.hsv.h - 90) * Math.PI) / 180;
    const x = 50 + 50 * this.hsv.s * Math.cos(t);
    const y = 50 + 50 * this.hsv.s * Math.sin(t);
    this.handle.style.left = `${x}%`;
    this.handle.style.top = `${y}%`;
    const hex = this.hex;
    this.handle.style.background = hex;
    this.canvas.style.filter = `brightness(${0.25 + this.hsv.v * 0.75})`;
    this.brightness.style.setProperty('--track-end', hsvToHex({ ...this.hsv, v: 1 }));
    this.canvas.setAttribute('aria-valuetext', hex);
  }

  update(source) {
    this.placeHandle();
    this.onChange(this.hex, source);
  }

  get hex() { return hsvToHex(this.hsv); }

  /** Set from outside without echoing a change event. */
  setHex(hex) {
    const hsv = hexToHsv(hex);
    // Keep the previous hue for grays so the handle doesn't jump.
    if (hsv.s === 0) hsv.h = this.hsv.h;
    this.hsv = hsv;
    this.brightness.value = Math.round(hsv.v * 100);
    this.placeHandle();
  }
}
