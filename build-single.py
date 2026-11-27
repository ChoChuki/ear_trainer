"""Build the standalone entry from the normal entry. Run from any directory."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent
html=(root/'index.html').read_text(encoding='utf-8')
html=html.replace('<html lang="en">','<html lang="en" data-single="1">')
html=re.sub(r'\s*<link rel="manifest"[^>]+>','',html)
html=re.sub(r'\s*<link rel="apple-touch-icon"[^>]+>','',html)
html=re.sub(r'<link rel="stylesheet" href="\./([^\"]+)">',lambda m:'<style>\n'+(root/m[1]).read_text(encoding='utf-8')+'\n</style>',html)
def inline(m):
    name=m[1];content=(root/name).read_text(encoding='utf-8')
    if name=='app.js':content='\n'.join((root/'vendor'/x).read_text(encoding='utf-8') for x in ['0000_JCLive_sf2_file.js','0400_JCLive_sf2_file.js'])+'\n'+content
    return '<script>\n'+content+'\n</script>'
html=re.sub(r'<script src="\./([^\"]+)"></script>',inline,html)
(root/'single-file/index.html').write_text(html,encoding='utf-8')
