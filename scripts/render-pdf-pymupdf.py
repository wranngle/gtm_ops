#!/usr/bin/env python3
"""Render proposal HTML to PDF using PyMuPDF Story.

The runner is intentionally small and JSON-speaking so the Bun/TypeScript app
can keep its existing PDF API while delegating rendering to PyMuPDF.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import pymupdf
except ModuleNotFoundError as exc:
    raise SystemExit(
        "PyMuPDF is required for PDF generation. Install with "
        "`python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt` "
        "or set PYMUPDF_PYTHON to a Python that can import pymupdf."
    ) from exc


LETTER = pymupdf.paper_rect("letter")
DEMO_WATERMARK_TEXT = "SYNTHETIC FIXTURE - NOT A REAL QUOTE"


PRINT_CONTRACT_CSS = """
<style id="wranngle-pymupdf-print-contract">
  @page { size: 8.5in 11in; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    width: 8.5in;
    color: #12111a;
    background: #ffffff;
  }
  body {
    display: block;
  }
  .sheet {
    display: block;
    width: 8.5in !important;
    min-height: 11in !important;
    box-sizing: border-box !important;
    padding: 0.25in !important;
    margin: 0 !important;
    page-break-after: always;
    break-after: page;
    overflow: hidden !important;
  }
  .sheet:last-of-type {
    page-break-after: auto;
    break-after: auto;
  }
  .page-card {
    box-sizing: border-box !important;
    width: 100% !important;
    min-height: 10.5in !important;
    margin: 0 !important;
    overflow: hidden !important;
  }
  .flight-deck,
  .next-step,
  .cta-row {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sheet.internal,
  #report-internal-strategy {
    display: none !important;
  }
</style>
"""


INTERNAL_SHEET_CSS = """
<style id="wranngle-pymupdf-internal-contract">
  .sheet.internal,
  #report-internal-strategy {
    display: block !important;
  }
</style>
"""


def inject_print_contract(html: str, internal_sheet: bool) -> str:
    css = PRINT_CONTRACT_CSS + (INTERNAL_SHEET_CSS if internal_sheet else "")
    lower = html.lower()
    head_end = lower.find("</head>")
    if head_end != -1:
        return html[:head_end] + css + html[head_end:]

    return "<!doctype html><html><head>" + css + "</head><body>" + html + "</body></html>"


def render_story(html: str, output: Path) -> int:
    output.parent.mkdir(parents=True, exist_ok=True)

    story = pymupdf.Story(html=html)
    writer = pymupdf.DocumentWriter(str(output))
    pages = 0
    more = True

    while more:
        device = writer.begin_page(LETTER)
        more, _filled = story.place(LETTER)
        story.draw(device)
        writer.end_page()
        pages += 1
        if pages > 200:
            writer.close()
            raise RuntimeError("PyMuPDF rendered more than 200 pages; refusing runaway PDF output.")

    writer.close()
    return pages


def stamp_demo_watermark(output: Path) -> None:
    doc = pymupdf.open(str(output))
    try:
        for page in doc:
            rect = pymupdf.Rect(0, page.rect.height - 18, page.rect.width, page.rect.height)
            page.draw_rect(rect, color=(0.72, 0.11, 0.11), fill=(0.996, 0.886, 0.886), width=0.6)
            page.insert_textbox(
                rect + (0, 3, 0, 0),
                DEMO_WATERMARK_TEXT,
                fontsize=7.5,
                fontname="helv",
                color=(0.72, 0.11, 0.11),
                align=pymupdf.TEXT_ALIGN_CENTER,
            )

        tmp = output.with_suffix(output.suffix + ".tmp")
        doc.save(str(tmp), garbage=4, deflate=True)
    finally:
        doc.close()

    os.replace(tmp, output)


def inspect_pdf(output: Path) -> dict[str, object]:
    doc = pymupdf.open(str(output))
    try:
        first = doc[0] if doc.page_count else None
        page_size = {"width": first.rect.width, "height": first.rect.height} if first else None
        text_lengths = [len(page.get_text().strip()) for page in doc]
        return {
            "success": True,
            "engine": "pymupdf",
            "pdfPath": str(output.resolve()),
            "pageCount": doc.page_count,
            "pageSize": page_size,
            "textLengths": text_lengths,
        }
    finally:
        doc.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render proposal HTML to PDF with PyMuPDF.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="Path to an HTML file.")
    source.add_argument("--stdin", action="store_true", help="Read HTML from stdin.")
    parser.add_argument("--output", type=Path, required=True, help="Path to write the PDF.")
    parser.add_argument("--internal-sheet", action="store_true", help="Include internal-only sheets.")
    parser.add_argument("--demo-mode", action="store_true", help="Stamp the synthetic-fixture watermark.")
    parser.add_argument("--verbose", action="store_true", help="Reserved for runner diagnostics.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.input:
        html = args.input.read_text(encoding="utf-8")
    else:
        html = sys.stdin.read()

    html = inject_print_contract(html, args.internal_sheet)
    render_story(html, args.output)

    if args.demo_mode:
        stamp_demo_watermark(args.output)

    print(json.dumps(inspect_pdf(args.output)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
