"""Render the SVG logo variants to PNG icons with headless Chrome (+ a zoomed preview for a visual check)."""
import base64, pathlib
from playwright.sync_api import sync_playwright
D = pathlib.Path(__file__).resolve().parent.parent / 'web/public/icons'
jobs = [('logo.svg', 'icon-192.png', 192, True), ('logo.svg', 'icon-512.png', 512, True),
        ('maskable.svg', 'icon-maskable-512.png', 512, False), ('maskable.svg', 'icon-maskable-192.png', 192, False),
        ('apple.svg', 'apple-touch-icon.png', 180, False), ('favicon.svg', 'favicon-32.png', 32, True), ('favicon.svg', 'favicon-16.png', 16, True)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for src, out, size, transparent in jobs:
        pg = b.new_page(viewport={'width': size, 'height': size})
        svg = (D / src).read_text()
        pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width=\"{size}\" height=\"{size}\" ", 1)}</body></html>')
        pg.screenshot(path=str(D / out), omit_background=transparent, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        pg.close()
    pg = b.new_page(viewport={'width': 760, 'height': 180})
    imgs = ''.join(f'<img src="data:image/png;base64,{base64.b64encode((D / n).read_bytes()).decode()}" style="width:128px;height:128px;image-rendering:pixelated">'
                   for n in ['favicon-16.png', 'favicon-32.png', 'icon-192.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
    pg.set_content(f'<body style="margin:0;display:flex;gap:20px;align-items:center;padding:20px;background:#eee">{imgs}</body>')
    pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/logo/icon-preview.png')
    b.close()
print('ok')
