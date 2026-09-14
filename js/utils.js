/* ── Shared Utilities ───────────────────────────────
   Pure functions used by multiple pages.
   No DOM dependencies — safe to load anywhere.
────────────────────────────────────────────────── */

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
