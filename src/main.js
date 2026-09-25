import { Game } from './game.js';
import { UI } from './ui/ui.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

async function boot() {
  const canvas = document.getElementById('game');
  if (!webglAvailable()) {
    document.getElementById('ui').innerHTML =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:Inter,sans-serif;text-align:center;padding:24px">New York Minute needs a browser with WebGL 2 (recent Chrome, Edge, Firefox or Safari).</div>';
    return;
  }
  const game = new Game(canvas);
  const ui = new UI(game);
  window.__game = game; // handy for debugging in the console
  const progress = (p, msg) =>
    new Promise((resolve) => {
      ui.setLoading(p, msg);
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });
  try {
    await game.init(progress);
  } catch (err) {
    console.error(err);
    ui.setLoading(1, `Failed to start: ${err.message}`);
    return;
  }
  ui.hideLoading();
  ui.enterTitle();
}

boot();
