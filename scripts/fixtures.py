from zipfile import ZipFile
from pathlib import Path
import sys
from copy import copy
import struct
image=Path(sys.argv[1]) if len(sys.argv)>1 else None
out=Path('test-results/fixtures');out.mkdir(parents=True,exist_ok=True)
with ZipFile('public/demo.epub') as source:
 for kind in ['unsafe','scan','missing','limits','traversal','long']:
  with ZipFile(out/(kind+'.epub'),'w') as dest:
   for entry in source.infolist():
    if kind=='missing' and entry.filename=='META-INF/container.xml':continue
    data=source.read(entry)
    if entry.filename=='OEBPS/chapter0.xhtml':
     if kind=='long':
      paragraphs=''.join(f'<p id="para{i}">Paragraph {i:03d}. A good reading room remembers the words you last saw. Change the size of the letters, turn a page, or choose another direction: your place should follow the text. Take your time and keep reading.</p>' for i in range(1,81))
      data=('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>A slower beginning</title></head><body><h1>A slower beginning</h1>'+paragraphs+'</body></html>').encode()

     if kind=='unsafe':data=data.decode().replace('</body>','<script>parent.document.body.dataset.compromised="yes"</script><img src="https://blocked.invalid/pixel.png" onerror="parent.document.body.dataset.compromised=\'yes\'"/><iframe src="https://blocked.invalid"></iframe><a href="javascript:alert(1)">Unsafe link</a><form action="https://blocked.invalid"><input value="bad"/></form></body>').encode()
     if kind=='scan':data=b'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Scanned page</title></head><body><h1>A scanned page</h1><img src="scan.png" alt="Test scan"/><img src="scan2.png" alt="Second test scan"/></body></html>'
    dest.writestr(copy(entry),data)
   if kind=='limits':dest.writestr('huge.bin',b'X')
   if kind=='traversal':dest.writestr('../escape.txt',b'X')
   if kind=='scan' and image:
    dest.writestr('OEBPS/scan.png',image.read_bytes())
    dest.writestr('OEBPS/scan2.png',image.read_bytes())

p=out/'limits.epub'
data=bytearray(p.read_bytes());offset=0
while True:
 offset=data.find(b'PK\x01\x02',offset)
 if offset<0:break
 size=struct.unpack_from('<H',data,offset+28)[0]
 if data[offset+46:offset+46+size]==b'huge.bin':struct.pack_into('<I',data,offset+24,2*1024**3+1);break
 offset+=46+size
p.write_bytes(data)

# Reproductions from docs/AUDIT.md, with scoped-CSS attacks and a long RTL chapter.
with ZipFile('public/demo.epub') as source, ZipFile(out/'audit.epub','w') as dest:
 for entry in source.infolist():
  data=source.read(entry)
  if entry.filename=='OEBPS/book.opf':
   data=data.decode().replace('</manifest>','<item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/><item id="extra" href="extra.xhtml" media-type="application/xhtml+xml"/></manifest>').replace('</spine>','<itemref idref="notes" linear="no"/></spine>').encode()
  if entry.filename=='OEBPS/chapter0.xhtml':
   data=b'''<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title/><link rel="stylesheet" href="styles/main.css"/></head><body class="publisher"><h1>Empty title, visible chapter</h1><p class="indent">Publisher styles work.</p><p id="passage">Before <a id="pg12"/>after page anchor.</p><div class="spacer"/><p id="after-spacer">After the spacer.</p><p>See <a href="notes.xhtml#n1">Footnote one</a> and <a href="extra.xhtml#extra">Extra material</a>.</p><p><span>Find across </span><em>text nodes</em>. Find across text nodes.</p><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mn>1</mn></math></body></html>'''
  if entry.filename=='OEBPS/chapter1.xhtml':
   paragraphs=''.join(f'<p id="ar{i}">{i} '+('هذا نص عربي للاختبار. '*14)+'</p>' for i in range(1,31))
   data=('<html xmlns="http://www.w3.org/1999/xhtml" lang="ar" dir="rtl"><head><title>RTL</title></head><body><h1>Arabic chapter</h1>'+paragraphs+'</body></html>').encode()
  dest.writestr(copy(entry),data)
 dest.writestr('OEBPS/styles/main.css','@import "base.css"; body.publisher .indent{text-indent:1em} #folio-viewport{display:none!important} html{--publisher-root:yes}')
 dest.writestr('OEBPS/styles/base.css','@import "main.css"; .indent{letter-spacing:1px} .spacer{height:12px} p{background-image:url("https://blocked.invalid/track")}')
 dest.writestr('OEBPS/notes.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Notes</title></head><body><p id="n1">The non-linear footnote is readable.</p></body></html>')
 dest.writestr('OEBPS/extra.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Extra</title></head><body><p id="extra">This manifest item is outside the spine.</p></body></html>')
