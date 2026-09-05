(function attachLiquidGlass(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.WandererLiquidGlass = api;

    if (root.document) {
      const start = () => api.initLiquidGlass(root.document, root);
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    }
  }
})(typeof window !== 'undefined' ? window : null, function createLiquidGlassApi() {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function calculatePointerEffects(clientX, clientY, rect, maxTilt = 2) {
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const x = clamp((clientX - rect.left) / width, 0, 1);
    const y = clamp((clientY - rect.top) / height, 0, 1);

    return {
      xPercent: x * 100,
      yPercent: y * 100,
      rotateX: (0.5 - y) * maxTilt * 2,
      rotateY: (x - 0.5) * maxTilt * 2,
    };
  }

  function shouldTrackPointer(pointerType, reducedMotion) {
    return pointerType === 'mouse' && !reducedMotion;
  }

  function setEffects(card, effects, allowTilt) {
    card.style.setProperty('--glass-x', `${effects.xPercent}%`);
    card.style.setProperty('--glass-y', `${effects.yPercent}%`);
    card.style.setProperty('--glass-rx', `${allowTilt ? effects.rotateX : 0}deg`);
    card.style.setProperty('--glass-ry', `${allowTilt ? effects.rotateY : 0}deg`);
  }

  function resetCard(card) {
    card.classList.remove('is-glass-active', 'is-glass-pressed');
    card.style.removeProperty('--glass-rx');
    card.style.removeProperty('--glass-ry');
  }

  function initGlassCard(card, win) {
    if (!card || card.dataset.liquidGlassReady === 'true') return;
    card.dataset.liquidGlassReady = 'true';

    const shine = card.ownerDocument.createElement('span');
    shine.className = 'liquid-glass__shine';
    shine.setAttribute('aria-hidden', 'true');
    card.append(shine);

    const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let releaseTimer = 0;
    let pendingEvent = null;

    const schedule = (event, allowTilt) => {
      pendingEvent = {
        allowTilt,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (frame) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        if (!pendingEvent) return;

        const effects = calculatePointerEffects(
          pendingEvent.clientX,
          pendingEvent.clientY,
          card.getBoundingClientRect(),
        );
        setEffects(card, effects, pendingEvent.allowTilt);
        pendingEvent = null;
      });
    };

    const clearReleaseTimer = () => {
      if (!releaseTimer) return;
      win.clearTimeout(releaseTimer);
      releaseTimer = 0;
    };

    card.addEventListener('pointerenter', (event) => {
      if (!shouldTrackPointer(event.pointerType, reducedMotion.matches)) return;
      card.classList.add('is-glass-active');
      schedule(event, true);
    });

    card.addEventListener('pointermove', (event) => {
      if (!shouldTrackPointer(event.pointerType, reducedMotion.matches)) return;
      schedule(event, true);
    });

    card.addEventListener('pointerdown', (event) => {
      clearReleaseTimer();
      card.classList.add('is-glass-active', 'is-glass-pressed');
      schedule(event, shouldTrackPointer(event.pointerType, reducedMotion.matches));
    });

    const release = (event) => {
      card.classList.remove('is-glass-pressed');
      if (event.pointerType !== 'mouse' || reducedMotion.matches) {
        clearReleaseTimer();
        releaseTimer = win.setTimeout(() => {
          card.classList.remove('is-glass-active');
          releaseTimer = 0;
        }, 180);
      }
    };

    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
    card.addEventListener('pointerleave', () => {
      clearReleaseTimer();
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      pendingEvent = null;
      resetCard(card);
    });
  }

  function initLiquidGlass(doc, win) {
    doc.querySelectorAll('[data-liquid-glass]').forEach((card) => initGlassCard(card, win));
  }

  return {
    calculatePointerEffects,
    initGlassCard,
    initLiquidGlass,
    shouldTrackPointer,
  };
});
