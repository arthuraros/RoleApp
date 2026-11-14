// Usa dp e a largura segura, inclusive em janela dividida. Não altera a RA-05.
export function homeCategoryLayout({ width, fontScale = 1, insets = {} }) {
  const safeWidth = Math.max(0, width - (insets.left || 0) - (insets.right || 0));
  const tablet = safeWidth >= 600;
  return {
    tablet,
    itemWidth: Math.min(tablet ? 144 : 124, Math.round((tablet ? 104 : 88) * Math.max(1, fontScale))),
    gap: tablet ? 12 : 8,
    paddingHorizontal: tablet ? 16 : 12,
  };
}
