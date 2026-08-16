/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// KiCanvas is loaded as a global custom-element bundle (public/dependencies),
// not as a typed npm package. Declare its JSX intrinsic elements so they can be
// used (and given a ref) with proper typing.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'kicanvas-embed': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          controls?: string;
          controlslist?: string;
          theme?: string;
        },
        HTMLElement
      >;
      'kicanvas-source': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          type?: string;
        },
        HTMLElement
      >;
    }
  }
}
