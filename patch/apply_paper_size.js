#!/usr/bin/env node
/**
 * apply_paper_size.js
 *
 * Local customization applied by patch_ergogen.sh: make the KiCad 8 template
 * emit a board-sized "User" paper (sized to the outline bounding box + margin)
 * instead of a fixed A3 sheet. This makes both the in-browser PCB preview
 * (KiCanvas) and KiCad open framed on the board rather than a huge empty sheet.
 *
 * It patches:
 *   - node_modules/ergogen/src/templates/kicad8.js (source, for CLI/dev)
 *   - public/dependencies/ergogen.js               (bundled, used by the GUI)
 *
 * The patch is idempotent.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// The computation block injected right after `outline_text` is defined.
const injection = `
                let paper_line = '(paper "A3")';
                try {
                    const coords = [...outline_text.matchAll(/\\((?:start|end|mid|xy)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\)/g)];
                    if (coords.length) {
                        const xs = coords.map(m => parseFloat(m[1]));
                        const ys = coords.map(m => parseFloat(m[2]));
                        const maxx = Math.max(...xs), maxy = Math.max(...ys);
                        const margin = 15;
                        const w = Math.min(Math.max(maxx + margin, 100), 1200);
                        const h = Math.min(Math.max(maxy + margin, 100), 1200);
                        paper_line = \`(paper "User" \${w.toFixed(2)} \${h.toFixed(2)})\`;
                    }
                } catch (e) {}`;

/**
 * Patch a file: find the outline_text assignment, inject the paper computation
 * after it, and replace the literal (paper "A3") with the computed line.
 * Handles the small formatting differences between the source and bundle.
 */
function patchFile(file) {
  if (!fs.existsSync(file)) {
    console.log(`  skip (not found): ${file}`);
    return;
  }
  let data = fs.readFileSync(file, 'utf8');

  if (data.includes('let paper_line')) {
    console.log(`  already patched: ${file}`);
    return;
  }

  // Find the outline_text declaration (tolerant of quote/whitespace differences).
  const anchorRe =
    /const outline_text = Object\.values\(params\.outlines\)\.join\((['"])\\n\1\);/;
  const m = data.match(anchorRe);
  if (!m) {
    console.log(`  anchor not found, skipping: ${file}`);
    return;
  }

  data = data.replace(anchorRe, (full) => full + injection);

  // Replace the hardcoded A3 paper line with the computed variable.
  data = data.replace(/\(paper "A3"\)/, '${paper_line}');

  fs.writeFileSync(file, data, 'utf8');
  console.log(`  patched: ${file}`);
}

patchFile(
  path.join(PROJECT_ROOT, 'node_modules/ergogen/src/templates/kicad8.js')
);
patchFile(path.join(PROJECT_ROOT, 'public/dependencies/ergogen.js'));
