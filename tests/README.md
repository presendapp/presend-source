# API test suite

Runs 25 real test cases against every category of endpoint (simple
GET, email, password, IP/geo, binary image upload, multipart PDF
upload, CORS preflight), against a real Cloudflare Workers runtime
(not just Node.js — catches bundling/runtime issues that Node's
module loader wouldn't).

## Usage

```bash
bash tests/run-tests.sh
```

This starts `wrangler pages dev` with a simulated KV binding, waits
for it to be ready, runs `tests/api-test-suite.mjs`, then cleans up
automatically (including any leftover `workerd` process — a known
gotcha where killing the wrangler wrapper process doesn't always
kill the underlying runtime).

Exit code is 0 if all tests pass, 1 otherwise — safe to wire into CI
later if wanted.

## Adding a new test

Edit `tests/api-test-suite.mjs` and add a case to the relevant
`test*()` function, or add a new one and call it from `main()`. Each
test uses `check(name, condition, detail)` to record a pass/fail.

## Fixtures

Binary test fixtures (a small JPEG with GPS EXIF, two tiny PDFs) are
expected at `/tmp/test-fixtures/`. Regenerate them with:

```bash
python3 -c "
from PIL import Image
import piexif
from reportlab.pdfgen import canvas
img = Image.new('RGB', (50, 50), color=(100, 150, 200))
exif_dict = {'GPS': {piexif.GPSIFD.GPSLatitudeRef: b'N', piexif.GPSIFD.GPSLatitude: ((48,1),(51,1),(0,1))}}
img.save('/tmp/test-fixtures/photo.jpg', 'jpeg', exif=piexif.dump(exif_dict), quality=90)
for i in [1, 2]:
    c = canvas.Canvas(f'/tmp/test-fixtures/doc{i}.pdf')
    c.drawString(100, 750, f'Test doc {i}')
    c.showPage()
    c.save()
"
```
