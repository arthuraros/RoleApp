const intersects = (frame, keyboard) => keyboard?.height > 0
  && frame.x < (keyboard.screenX || 0) + keyboard.width
  && frame.x + frame.width > (keyboard.screenX || 0)
  && frame.y < keyboard.screenY + keyboard.height;

// Se adjustResize já reduziu a janela, a interseção será zero.
export function keyboardOverlap(frame, keyboard) {
  if (!frame || !intersects(frame, keyboard)) return 0;
  return Math.min(frame.height, Math.max(0, frame.y + frame.height - keyboard.screenY));
}

export function focusedFieldScrollDelta(viewport, input, keyboard, gap = 12) {
  if (!viewport || !input) return 0;
  const top = viewport.y + gap;
  const bottom = viewport.y + viewport.height - keyboardOverlap(viewport, keyboard) - gap;
  if (bottom <= top) return 0;
  // Um campo multilinha maior que a área visível mantém seu topo acessível.
  if (input.height > bottom - top) return input.y - top;
  if (input.y + input.height > bottom) return input.y + input.height - bottom;
  if (input.y < top) return input.y - top;
  return 0;
}
