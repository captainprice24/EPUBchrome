# Real EPUB regression corpus

`scripts/corpus.py` compiles three **unmodified** samples from [IDPF/epub3-samples](https://github.com/IDPF/epub3-samples), maintained by the W3C EPUB 3 Community Group, pinned at commit `7651e2002b631e6577fadf7e9e0692fa6efb8746`:

- `wasteland-woff`: T. S. Eliot, _The Waste Land_; EPUB preparation by the sample contributors. Tests linked CSS, stylesheet imports and the bundled Old Standard fonts. The cover attribution and license are in its OPF.
- `internallinks`: Antenna House sample with Japanese content and Unicode identifiers.
- `regime-anticancer-arabic`: sample supplied by Hachette Livre / David Servan-Schreiber, Arabic language and right-to-left progression. Its source OPF retains the contributor and license metadata.

Upstream defaults to **CC BY-SA 3.0**, except where specified by the individual sample. Source and metadata are preserved in the compiled EPUBs. These fixtures are downloaded for testing, stored under ignored `test-results/corpus`, and are **not bundled with Folio** or presented as recommended reading or medical advice. Font terms remain those of the original samples; the upstream file `README.md` supplies the collection's licensing notice.

The preparation script reads pinned Git blobs; it never executes upstream scripts. `npm test` prepares this small corpus when needed and therefore needs GitHub access on a fresh machine. It is a regression sample, not an EPUB conformance certification or an exhaustive corpus. Vertical writing, fixed layout and obfuscated fonts are not yet covered or claimed as supported.

CI caches the pinned source checkout through `FOLIO_CORPUS_CACHE`, outside the Playwright output directory. The key includes the preparation script and its commit pin. Compiled EPUBs remain disposable test output; a cache miss requires GitHub access.
