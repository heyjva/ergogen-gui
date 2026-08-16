import { useEffect, useRef } from 'react';

/**
 * Props for the PcbPreview component.
 * @typedef {object} Props
 * @property {string} pcb - The KiCad PCB file content as a string.
 * @property {string} key - A unique key for the component, important for React's rendering logic.
 * @property {string} [aria-label] - An optional aria-label for the preview container.
 * @property {string} [data-testid] - An optional data-testid for testing purposes.
 */
type Props = {
  pcb: string;
  previewKey: string;
  'aria-label'?: string;
  'data-testid'?: string;
};

/**
 * Minimal shape of the KiCanvas viewer we interact with. KiCanvas is a custom
 * element with an internal viewer that exposes zoom helpers; we only need
 * zoom_to_board() to frame the board (Edge.Cuts) instead of the whole sheet.
 */
type KiCanvasViewer = {
  zoom_to_board?: () => void;
};
type KiCanvasEmbedElement = HTMLElement & {
  viewer?: KiCanvasViewer;
};

/**
 * A React component that embeds a KiCad PCB preview using the `<kicanvas-embed>` custom element.
 * This component takes the PCB data as a string and renders it within an interactive canvas.
 *
 * By default KiCanvas fits the whole drawing sheet (zoom_to_page) on load, which
 * makes the actual board appear small and off-center. On load we call
 * zoom_to_board() so the preview is automatically centered and fit to the board.
 *
 * @param {Props} props - The props for the component.
 * @returns {JSX.Element} A `<kicanvas-embed>` element containing the PCB source.
 */
const PcbPreview = ({
  pcb,
  previewKey,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: Props): JSX.Element => {
  const embedRef = useRef<KiCanvasEmbedElement | null>(null);

  useEffect(() => {
    const el = embedRef.current;
    if (!el) return;

    let cancelled = false;

    // Try to frame the board. KiCanvas needs the viewer + layers ready, so we
    // retry briefly until zoom_to_board is available and succeeds.
    const fitToBoard = (attempt = 0): void => {
      if (cancelled) return;
      const viewer = el.viewer;
      if (viewer && typeof viewer.zoom_to_board === 'function') {
        try {
          viewer.zoom_to_board();
          return;
        } catch {
          // Edge.Cuts layer may not be parsed yet; fall through to retry.
        }
      }
      if (attempt < 30) {
        window.setTimeout(() => fitToBoard(attempt + 1), 100);
      }
    };

    // KiCanvas dispatches a "load" event when the document is ready; use it as
    // the primary trigger, with a fallback timer in case the event was missed.
    const onLoad = () => fitToBoard();
    el.addEventListener('load', onLoad);
    const fallback = window.setTimeout(() => fitToBoard(), 300);

    return () => {
      cancelled = true;
      el.removeEventListener('load', onLoad);
      window.clearTimeout(fallback);
    };
  }, [previewKey, pcb]);

  return (
    <kicanvas-embed
      ref={embedRef}
      key={previewKey}
      controls="full"
      controlslist="nodownload nooverlay"
      theme="kicad"
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
      <kicanvas-source type="board">{pcb}</kicanvas-source>
    </kicanvas-embed>
  );
};

export default PcbPreview;
