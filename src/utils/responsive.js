// Medidas em dp. O tamanho da fonte continua sob controle do sistema operacional.
export const PAGE_CONTENT = { width: '100%', maxWidth: 960, alignSelf: 'center' };
export const FORM_CONTENT = { width: '100%', maxWidth: 680, alignSelf: 'center' };
export const TOUCH_TARGET = { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' };

export function responsiveMetrics({ width, height, fontScale = 1, insets = {} }) {
  const safeWidth = Math.max(0, width - (insets.left || 0) - (insets.right || 0));
  const safeHeight = Math.max(0, height - (insets.top || 0) - (insets.bottom || 0));
  const contentWidth = Math.min(safeWidth, 960);
  const compact = contentWidth < 380 || fontScale >= 1.15;
  const highlightWidth = Math.min(315, Math.max(0, contentWidth - 32));
  const highlightHeight = Math.ceil(195 * Math.max(1, Math.min(fontScale, 2)));
  return {
    contentWidth, compact,
    authWidth: Math.min(480, Math.max(0, safeWidth - 32)),
    logoWidth: Math.min(250, Math.max(0, safeWidth - 96)),
    modalMaxHeight: Math.max(0, safeHeight - 24),
    highlightWidth, highlightHeight, highlightTopHeight: highlightHeight - 57,
    highlightInterval: highlightWidth + 14,
    menuWidth: Math.min(352, Math.max(0, contentWidth - 32)),
  };
}
