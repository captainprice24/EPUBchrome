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
     if kind=='scan':data=b'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Scanned page</title></head><body><h1>A scanned page</h1><img src="scan.png" alt="Test scan"/></body></html>'
    dest.writestr(copy(entry),data)
   if kind=='limits':dest.writestr('huge.bin',b'X')
   if kind=='traversal':dest.writestr('../escape.txt',b'X')
   if kind=='scan' and image:dest.writestr('OEBPS/scan.png',image.read_bytes())

p=out/'limits.epub'
data=bytearray(p.read_bytes());offset=0
while True:
 offset=data.find(b'PK\x01\x02',offset)
 if offset<0:break
 size=struct.unpack_from('<H',data,offset+28)[0]
 if data[offset+46:offset+46+size]==b'huge.bin':struct.pack_into('<I',data,offset+24,2*1024**3+1);break
 offset+=46+size
p.write_bytes(data)
