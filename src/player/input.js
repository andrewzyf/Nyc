// Keyboard, mouse-drag look, wheel zoom and a simple touch joystick.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.look = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.dragging = false;
    this.enabled = true;
    this.touchMove = { x: 0, y: 0, active: false };
    this.handlers = new Map();

    window.addEventListener('keydown', (e) => {
      if (this._isTyping(e)) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
      this._emit('key', { code: k, event: e });
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
      this._emit('pointerdown', e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (document.pointerLockElement === canvas) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        return;
      }
      if (!this.dragging) return;
      this.look.dx += e.clientX - this.lastX;
      this.look.dy += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const up = (e) => {
      if (e.pointerType === 'touch') return;
      this.dragging = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    this._setupTouch();
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  _setupTouch() {
    const c = this.canvas;
    const touches = new Map();
    c.addEventListener(
      'touchstart',
      (e) => {
        for (const t of e.changedTouches) {
          const left = t.clientX < window.innerWidth * 0.45;
          touches.set(t.identifier, { x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, left });
          if (left) this.touchMove.active = true;
        }
        e.preventDefault();
      },
      { passive: false },
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        for (const t of e.changedTouches) {
          const s = touches.get(t.identifier);
          if (!s) continue;
          if (s.left) {
            const dx = t.clientX - s.ox;
            const dy = t.clientY - s.oy;
            const max = 60;
            this.touchMove.x = Math.max(-1, Math.min(1, dx / max));
            this.touchMove.y = Math.max(-1, Math.min(1, dy / max));
          } else {
            this.look.dx += (t.clientX - s.x) * 1.4;
            this.look.dy += (t.clientY - s.y) * 1.4;
          }
          s.x = t.clientX;
          s.y = t.clientY;
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        const s = touches.get(t.identifier);
        if (s?.left) {
          this.touchMove = { x: 0, y: 0, active: false };
        }
        touches.delete(t.identifier);
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
  }

  _emit(type, e) {
    for (const fn of this.handlers.get(type) || []) fn(e);
  }

  down(...codes) {
    return this.enabled && codes.some((c) => this.keys.has(c));
  }

  wasPressed(code) {
    return this.enabled && this.pressed.has(code);
  }

  /** Movement vector in local space: x = strafe right, y = forward */
  moveVector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.touchMove.active) {
      x += this.touchMove.x;
      y -= this.touchMove.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.dx = 0;
    this.look.dy = 0;
    return l;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressed.clear();
  }
}
