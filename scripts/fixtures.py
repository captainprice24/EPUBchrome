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

# Original, unencrypted MOBI6 fixture: PDB records, PalmDOC header and MOBI metadata.
def make_mobi(encryption=0, compression=1):
 title=b'The Local Reading Guide'
 def record(kind, text): return struct.pack('>II',kind,len(text)+8)+text
 exth_records=record(100,b'Folio Studio')+record(503,title)
 exth=b'EXTH'+struct.pack('>II',len(exth_records)+12,2)+exth_records
 exth+=b'\0'*((-len(exth))%4)
 header=bytearray(248)
 struct.pack_into('>H',header,0,compression)
 body=b'<html><head><title>The Local Reading Guide</title></head><body><h1>A private beginning</h1><p>This MOBI book is read locally. Highlight these words and keep your place.</p><mbp:pagebreak/><h1>A second chapter</h1><p>Your original document stays unchanged.</p></body></html>'
 struct.pack_into('>I',header,4,len(body));struct.pack_into('>HHH',header,8,1,4096,encryption)
 header[16:20]=b'MOBI';struct.pack_into('>IIII',header,20,232,2,65001,12345)
 struct.pack_into('>I',header,36,6);struct.pack_into('>II',header,84,248+len(exth),len(title))
 header[95]=9;struct.pack_into('>I',header,108,0xffffffff);struct.pack_into('>I',header,128,64);struct.pack_into('>I',header,244,0xffffffff)
 first=bytes(header)+exth+title
 pdb=bytearray(96);pdb[:len(title)]=title;pdb[60:68]=b'BOOKMOBI';struct.pack_into('>H',pdb,76,2)
 struct.pack_into('>I',pdb,78,96);struct.pack_into('>I',pdb,86,96+len(first))
 return bytes(pdb)+first+body
(out/'sample.mobi').write_bytes(make_mobi())
(out/'palmdoc.mobi').write_bytes(make_mobi(compression=2))
(out/'protected.mobi').write_bytes(make_mobi(encryption=2))
(out/'sample.md').write_text('# Field notes\n\nPrivate reading without uploads.\n\n## First trail\n\nA passage worth highlighting. Visit the [second trail](#second-trail).\n\n| Topic | Detail |\n| --- | --- |\n| Storage | Local |\n\n```javascript\nconst privateReading = true;\n```\n\n## Second trail\n\nYou found the second section.\n\n<script>parent.document.body.dataset.compromised="yes"</script>\n![Blocked remote image](https://blocked.invalid/pixel.png)\n',encoding='utf8')

# Body attributes, missing closing body, and an embedded-image record exercise
# Folio's small, documented patch to the pinned MOBI6 parser.
raw=make_mobi();first=struct.unpack_from('>I',raw,78)[0];text_start=struct.unpack_from('>I',raw,86)[0]
body=raw[text_start:].replace(b'<body>',b'<body class="publisher">').replace(b'</body></html>',b' Final words stay intact!')
patched=bytearray(raw[:text_start]);struct.pack_into('>I',patched,first+4,len(body))
(out/'body-attributes.mobi').write_bytes(bytes(patched)+body)
import zlib
png_chunk=lambda kind,data:struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',8,8,8,2,0,0,0))+png_chunk(b'IDAT',zlib.compress((b'\0'+bytes([40,120,70])*8)*8))+png_chunk(b'IEND',b'')
body=raw[text_start:].replace(b'<mbp:pagebreak/>',b'<img recindex="1"/><mbp:pagebreak/>')
header=bytearray(raw[first:text_start]);struct.pack_into('>I',header,4,len(body));struct.pack_into('>I',header,108,2)
pdb=bytearray(104);pdb[:78]=raw[:78];struct.pack_into('>H',pdb,76,3)
for i,offset in enumerate([104,104+len(header),104+len(header)+len(body)]):struct.pack_into('>I',pdb,78+i*8,offset)
(out/'images.mobi').write_bytes(bytes(pdb)+header+body+png)
