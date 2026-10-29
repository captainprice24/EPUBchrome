"""Expose actionable test failures in the public Actions summary without hiding failures."""
import json, os, re
from pathlib import Path
lines=['## Browser test failure details']
def walk(suite):
 for spec in suite.get('specs',[]):
  for test in spec.get('tests',[]):
   for result in test.get('results',[]):
    if result.get('status') not in ['failed','timedOut','interrupted']:continue
    lines.append('### '+spec.get('title','Untitled test'))
    errors=result.get('errors') or [result.get('error',{})]
    for error in errors:
     text=re.sub(r'\x1b\[[0-9;]*m','',error.get('message','No message recorded.'))
     lines.extend(['```text',text[:5000],'```'])
 for child in suite.get('suites',[]):walk(child)
for name in ['reader-results.json','pages-results.json']:
 p=Path('test-results')/name
 if p.exists():
  report=json.loads(p.read_text())
  for suite in report.get('suites',[]):walk(suite)
if len(lines)==1:lines.append('No completed Playwright failure report was available. Inspect the failed workflow step and uploaded test evidence.')
summary='\n\n'.join(lines)+'\n'
print(summary)
if os.environ.get('GITHUB_STEP_SUMMARY'):
 with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write(summary)
