"""Compile three pinned IDPF/W3C samples; never execute upstream build scripts.
Sources and license attribution: tests/corpus/README.md.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
import subprocess
import tempfile

PIN = '7651e2002b631e6577fadf7e9e0692fa6efb8746'
SAMPLES = ['wasteland-woff', 'internallinks', 'regime-anticancer-arabic']
cache = Path(tempfile.gettempdir()) / 'folio-epub-corpus'
if not (cache / '.git').exists():
    subprocess.run(['git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse',
                    'https://github.com/IDPF/epub3-samples.git', str(cache)], check=True)
if subprocess.run(['git', '-C', str(cache), 'cat-file', '-e', PIN], capture_output=True).returncode:
    subprocess.run(['git', '-C', str(cache), 'fetch', '--depth', '1', 'origin', PIN], check=True)
out = Path('test-results/corpus')
out.mkdir(parents=True, exist_ok=True)
for sample in SAMPLES:
    prefix = '30/' + sample + '/'
    paths = subprocess.check_output(['git', '-C', str(cache), 'ls-tree', '-r', '--name-only', PIN, prefix], text=True).splitlines()
    with ZipFile(out / (sample + '.epub'), 'w') as archive:
        paths.sort(key=lambda p: p != prefix + 'mimetype')
        for path in paths:
            data = subprocess.check_output(['git', '-C', str(cache), 'show', PIN + ':' + path])
            name = path[len(prefix):]
            archive.writestr(name, data, compress_type=ZIP_STORED if name == 'mimetype' else ZIP_DEFLATED)
    print('Prepared', sample)
