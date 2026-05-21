# PDF generation

Snapshot date: 2026-05-20.

`gtm_ops` uses PyMuPDF as the proposal PDF renderer. The app-facing API remains
[`lib/pdf-generator.ts`](../../lib/pdf-generator.ts): pipeline code calls
`generatePDF()` or `generatePDFFromContent()`, and that bridge invokes
[`scripts/render-pdf-pymupdf.py`](../../scripts/render-pdf-pymupdf.py).

## Contract

- Source artifacts are generated as HTML first, then rendered to Letter-size PDF
  through `pymupdf.Story` and `pymupdf.DocumentWriter`.
- The runner injects a small print contract for `.sheet` and `.page-card` so
  proposal HTML maps to 8.5in by 11in pages without depending on browser-only
  print quirks.
- Client PDFs hide `.sheet.internal` / `#report-internal-strategy`; internal
  PDFs pass `--internal-sheet`.
- Demo PDFs are stamped after rendering with real text-layer watermark content:
  `SYNTHETIC FIXTURE - NOT A REAL QUOTE`.
- Set `PYMUPDF_PYTHON` when the Python interpreter is not `.venv/bin/python` or
  `python3`.

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

The pinned range is in [`requirements.txt`](../../requirements.txt). Do not add
another Node HTML-to-PDF engine unless this document is updated with the new
decision and migration path.

## Sources

- PyMuPDF FAQ, HTML-to-PDF with `Story`:
  <https://pymupdf.readthedocs.io/en/latest/faq/index.html#how-do-i-convert-html-to-pdf>
- PyMuPDF `Story` API, Letter page loop and fit helpers:
  <https://pymupdf.readthedocs.io/en/latest/story-class.html>
- PyMuPDF repository:
  <https://github.com/pymupdf/PyMuPDF>

Refresh by checking the upstream docs for `Story`, `DocumentWriter`, and license
changes before changing the renderer. Rough size: under 10 KB.
