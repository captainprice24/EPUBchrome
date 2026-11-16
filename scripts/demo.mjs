// Builds the bundled sample book, public/demo.epub. The prose is original
// demonstration content written for this project. Entry dates are fixed so
// the same sources always produce the same bytes.
import { mkdir, writeFile } from "node:fs/promises";
import { ZipWriter, BlobWriter, TextReader, configure } from "@zip.js/zip.js";

configure({ useWebWorkers: false });
const chapters = [
  [
    "A slower beginning",
    "There is a certain kind of morning that asks nothing of you. Light settles on the windowsill. The kettle finds its voice. Somewhere beyond the glass, the world is already in motion.",
    "This is a small atlas of those moments: the overlooked paths, the generous pauses, the places we return to when we need to remember how to pay attention.",
  ],
  [
    "The shape of a place",
    "We tend to think of a place as a point on a map. But a place is also the way the air changes before rain, the particular sound of a door, the distance between a familiar voice and home.",
    "To know a place is to notice it more than once. Walk the same street in different seasons. Find the bench that catches the last of the afternoon sun. Let the map become a memory.",
  ],
  [
    "Notes from the margins",
    "A book is never quite the same book twice. We bring a different day to every page, and the sentences that once passed quietly can suddenly stop us in our tracks.",
    "Leave a mark where something matters. Not to keep the moment from changing, but to remember that you were here. The margins are a conversation with a future version of yourself.",
  ],
  [
    "An invitation to wander",
    "Take the longer way home. Follow the small road that seems to lead nowhere in particular. There are discoveries that only appear when we stop looking for a destination.",
    "Wandering is not the opposite of purpose. Sometimes it is how purpose finds us. There is room in a good day for a little uncertainty, for a question left open, for an unhurried chapter.",
  ],
  [
    "What we carry forward",
    "The things we keep are not always things. A rhythm. A sentence. The courage someone lent us at exactly the right moment. We carry these quietly, like folded maps.",
    "When you close this book, take one small thing with you. A reason to look a little closer. A reminder to leave room. The next chapter is yours to write.",
  ],
];
const entry = {
  lastModDate: new Date(Date.UTC(2026, 0, 1)),
  extendedTimestamp: false,
};
const writer = new ZipWriter(new BlobWriter("application/epub+zip"));
const add = (name, text, options = {}) =>
  writer.add(name, new TextReader(text), { ...entry, ...options });
// The EPUB container requires an uncompressed mimetype as the first entry.
await add("mimetype", "application/epub+zip", { level: 0 });
await add(
  "META-INF/container.xml",
  '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
const manifest = chapters
  .map(
    (_, i) =>
      `<item id="c${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`,
  )
  .join("");
const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join("");
await add(
  "OEBPS/book.opf",
  `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">folio-original-demo</dc:identifier><dc:title>The Quiet Atlas</dc:title><dc:creator>Folio Studio</dc:creator><dc:language>en</dc:language></metadata><manifest>${manifest}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>${spine}</spine></package>`,
);
const links = chapters
  .map(([title], i) => `<li><a href="chapter${i}.xhtml">${title}</a></li>`)
  .join("");
await add(
  "OEBPS/nav.xhtml",
  `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${links}</ol></nav></body></html>`,
);
for (const [i, [title, a, b]] of chapters.entries()) {
  const paragraphs = [a, b, a, b].map((text) => `<p>${text}</p>`).join("");
  await add(
    `OEBPS/chapter${i}.xhtml`,
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><p class="chapter-label">CHAPTER ${String(i + 1).padStart(2, "0")}</p><h1>${title}</h1>${paragraphs}</body></html>`,
  );
}
await mkdir("public", { recursive: true });
await writeFile(
  "public/demo.epub",
  Buffer.from(await (await writer.close()).arrayBuffer()),
);
