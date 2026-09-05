(function attachLiquidGlass(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WandererLiquidGlass = api;
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

  return { calculatePointerEffects, shouldTrackPointer };
});
