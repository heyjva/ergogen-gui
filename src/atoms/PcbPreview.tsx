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

    // Recursively search an element and its shadow roots for a node matching
    // the predicate. KiCanvas nests its board viewer several shadow roots deep
    // (kicanvas-embed -> kc-board-app -> kc-board-viewer), so a plain
    // querySelector won't find it.
    const deepFind = (
      root: Element | ShadowRoot,
      pred: (el: Element) => boolean
    ): Element | null => {
      const children = Array.from(
        (root as Element).querySelectorAll?.('*') ?? []
      );
      for (const child of children) {
        if (pred(child)) return child;
        const sr = (child as HTMLElement).shadowRoot;
        if (sr) {
          const found = deepFind(sr, pred);
          if (found) return found;
        }
      }
      return null;
    };

    // Try to find the KiCanvas viewer that exposes zoom_to_board and call it.
    const fitToBoard = (attempt = 0): void => {
      if (cancelled) return;

      // 1) The embed may directly expose .viewer.
      let viewer: KiCanvasViewer | undefined = el.viewer;

      // 2) Otherwise, dig through the shadow DOM for the board viewer element
      //    and read its `.viewer` (the object with zoom_to_board).
      if (!viewer || typeof viewer.zoom_to_board !== 'function') {
        const boardViewerEl = deepFind(
          el,
          (c) => c.tagName?.toLowerCase() === 'kc-board-viewer'
        ) as (Element & { viewer?: KiCanvasViewer }) | null;
        viewer = boardViewerEl?.viewer;
      }

      if (viewer && typeof viewer.zoom_to_board === 'function') {
        try {
          viewer.zoom_to_board();
          console.debug('[PcbPreview] zoom_to_board() called (fit to board)');
          return;
        } catch (e) {
          console.debug('[PcbPreview] zoom_to_board threw, will retry', e);
          // Edge.Cuts layer may not be parsed yet; retry below.
        }
      }

      if (attempt < 60) {
        window.setTimeout(() => fitToBoard(attempt + 1), 100);
      } else {
        console.warn(
          '[PcbPreview] gave up trying to auto-fit: board viewer / zoom_to_board not found'
        );
      }
    };

    // Start polling shortly after mount; also react to the internal load event
    // if it happens to bubble.
    const onLoad = () => fitToBoard();
    el.addEventListener('load', onLoad);
    const start = window.setTimeout(() => fitToBoard(), 200);

    return () => {
      cancelled = true;
      el.removeEventListener('load', onLoad);
      window.clearTimeout(start);
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
