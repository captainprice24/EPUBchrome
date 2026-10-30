# Document fixtures

`reading.djvu` is original test material made for Folio: two colour pages and a monochrome page, with an embedded text layer on page one. It exercises IW44, JB2 and BZZ text decoding. The text and diagrams were created for this project, rather than copied from a publication. DjVuLibre 3.5.28 was used **only to generate this fixture**, and is not a runtime dependency or bundled with the app.

`scripts/fixtures.py` generates original Markdown and small unencrypted MOBI6/PalmDOC fixtures, plus a DRM-marked rejection case. PDF fixtures are generated locally by Chromium in `tests/formats.spec.ts`. None of these fixtures contains purchased or DRM-removed material. They cover important regression cases, not every variant of their formats.
