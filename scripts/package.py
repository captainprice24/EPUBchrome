"""Package the production extension, never application secrets or local user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json,hashlib
root=Path('.output/chrome-mv3')
manifest=json.loads((root/'manifest.json').read_text())
assert manifest['manifest_version']==3
assert manifest['action']['default_title']=='Open Folio'
assert (root/'reader.html').is_file()
assert (root/'ocr/lang/eng.traineddata.gz').is_file()
output=Path('.output')/('folio-'+manifest['version']+'-chrome.zip')
with ZipFile(output,'w',ZIP_DEFLATED) as z:
 for f in sorted(root.rglob('*')):
  if f.is_file():z.write(f,f.relative_to(root))
with ZipFile(output) as z:
 assert z.testzip() is None
 assert '.env' not in z.namelist()
print(f'{output} ({output.stat().st_size:,} bytes)')
print('SHA-256:',hashlib.sha256(output.read_bytes()).hexdigest())
