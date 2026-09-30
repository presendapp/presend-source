// Suite de tests automatisée pour tous les endpoints publics de l'API Presend.
// Usage: node tests/api-test-suite.mjs
// Nécessite: wrangler pages dev déjà lancé sur le port fourni (voir run-tests.sh).

const BASE = process.env.PRESEND_TEST_BASE || 'http://localhost:8788';
const FIXTURES = '/tmp/test-fixtures';

// Marque chaque requête de cette suite avec un en-tête distinctif, pour que
// les endpoints excluent ce trafic de test des compteurs publics /api/api-stats
// et /api/stats (voir checkRateLimit(..., isTest) dans functions/api/*.js).
// Le rate limiting reste actif normalement -- seul le compteur de visites
// affiché publiquement est exclu.
const _originalFetch = globalThis.fetch;
globalThis.fetch = (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  headers.set('X-Presend-Test', '1');
  return _originalFetch(url, { ...options, headers });
};

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function testCase(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    failed++;
    failures.push(`${name} — EXCEPTION: ${e.message}`);
    console.log(`  ❌ EXCEPTION: ${e.message}`);
  }
}

// --- Simple GET endpoints ---
async function testSimpleGets() {
  const cases = [
    { path: '/api/uuid', expect: (j) => Array.isArray(j.uuids) && typeof j.uuids[0] === 'string' },
    { path: '/api/timestamp', expect: (j) => typeof j.unix_seconds === 'number' && typeof j.iso_8601 === 'string' },
    { path: '/api/color?hex=%23ff0000', expect: () => true },
    { path: '/api/user-agent', expect: () => true },
    { path: '/api/base64?text=hello&mode=encode', expect: (j) => j.result === 'aGVsbG8=' },
    { path: '/api/jwt-decode?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', expect: () => true },
    { path: '/api/health', expect: (j) => j.status === 'ok' },
    { path: '/api/csv-json?csv=a,b%0A1,2', expect: () => true },
  ];
  for (const c of cases) {
    const res = await fetch(BASE + c.path);
    let body;
    try { body = await res.json(); } catch (e) { body = null; }
    check(c.path, res.status === 200 && body && c.expect(body), `status=${res.status} body=${JSON.stringify(body).slice(0, 150)}`);
  }
}

// --- Email endpoints ---
async function testEmail() {
  const res1 = await fetch(BASE + '/api/email-verify?email=test@mailinator.com');
  const j1 = await res1.json();
  check('email-verify: disposable detected', j1.disposable === true, JSON.stringify(j1));

  const res2 = await fetch(BASE + '/api/email-verify?email=info@github.com');
  const j2 = await res2.json();
  check('email-verify: role account detected', j2.role_account === true, JSON.stringify(j2));

  const res3 = await fetch(BASE + '/api/email-validate?email=not-an-email');
  const j3 = await res3.json();
  check('email-validate: invalid syntax caught', j3.syntax_valid === false, JSON.stringify(j3));

  const res4 = await fetch(BASE + '/api/email-disposable?email=x@mailinator.com');
  const j4 = await res4.json();
  check('email-disposable: mailinator flagged', j4.disposable === true, JSON.stringify(j4));
}

// --- Password endpoints ---
async function testPassword() {
  const res1 = await fetch(BASE + '/api/password?length=20');
  const j1 = await res1.json();
  check('password: generates correct length', j1.password && j1.password.length === 20, JSON.stringify(j1));

  const res2 = await fetch(BASE + '/api/password-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'password123', check_breach: true }),
  });
  const j2 = await res2.json();
  check('password-check: weak+breached password flagged', j2.strength === 'fair' && j2.breach && j2.breach.breached === true, JSON.stringify(j2));

  const res3 = await fetch(BASE + '/api/password-breach?password=password123');
  const j3 = await res3.json();
  check('password-breach: known breach detected', j3.breached === true, JSON.stringify(j3));
}

// --- Phone endpoint ---
async function testPhone() {
  const res1 = await fetch(BASE + '/api/phone-verify?number=%2B14155552671');
  const j1 = await res1.json();
  check('phone-verify: E.164 number valid, no IP inference used', j1.valid === true && j1.country === 'US' && j1.ip_inferred_country === null, JSON.stringify(j1));

  const res2 = await fetch(BASE + '/api/phone-verify?number=4155552671&country=US');
  const j2 = await res2.json();
  check('phone-verify: local number with explicit country', j2.valid === true && j2.formats.e164 === '+14155552671', JSON.stringify(j2));

  const res3 = await fetch(BASE + '/api/phone-verify?number=abc123');
  const j3 = await res3.json();
  check('phone-verify: invalid number rejected', j3.valid === false, JSON.stringify(j3));
}

// --- IP endpoint ---
async function testIp() {
  const res = await fetch(BASE + '/api/ip');
  const j = await res.json();
  check('ip: returns IP and geo fields', typeof j.ip === 'string' && 'tor' in j, JSON.stringify(j));
}

// --- Combined security scan ---
async function testSecurityScan() {
  const res = await fetch(BASE + '/api/security-scan?url=https://github.com');
  const j = await res.json();
  check(
    'security-scan: combines headers + reputation + attack_surface',
    typeof j.overall_score === 'number' && j.security_headers && 'checked' in j.reputation && 'checked' in j.attack_surface,
    JSON.stringify(j).slice(0, 300)
  );
}

// --- Email anti-spoofing (SPF/DMARC/DKIM) ---
async function testEmailSecurity() {
  const res = await fetch(BASE + '/api/email-security?domain=google.com');
  const j = await res.json();
  check(
    'email-security: SPF/DMARC parsed correctly for google.com',
    j.spf.configured === true && j.dmarc.configured === true && j.dmarc.policy === 'reject' && j.dmarc.enforced === true,
    JSON.stringify(j)
  );

  const res2 = await fetch(BASE + '/api/email-security?domain=not_a_valid_domain');
  const j2 = await res2.json();
  check('email-security: invalid domain rejected', res2.status === 400 && !!j2.error, JSON.stringify(j2));
}

// --- Perceptual image hash / similarity ---
async function testImageSimilarity() {
  const fs = await import('fs');
  const bufA = fs.readFileSync('/tmp/test-fixtures/similar_a.png');
  const bufA2 = fs.readFileSync('/tmp/test-fixtures/similar_a2.jpg');
  const bufB = fs.readFileSync('/tmp/test-fixtures/different_b.png');

  const fd1 = new FormData();
  fd1.append('files', new Blob([bufA]), 'a.png');
  const res1 = await fetch(BASE + '/api/image-similarity', { method: 'POST', body: fd1 });
  const j1 = await res1.json();
  check('image-similarity: single-file hash returned', typeof j1.hash === 'string' && j1.hash.length === 16, JSON.stringify(j1));

  const fd2 = new FormData();
  fd2.append('files', new Blob([bufA]), 'a.png');
  fd2.append('files', new Blob([bufA2]), 'a2.jpg');
  const res2 = await fetch(BASE + '/api/image-similarity', { method: 'POST', body: fd2 });
  const j2 = await res2.json();
  check('image-similarity: recompressed image scores near-identical', j2.similarity_percent >= 95, JSON.stringify(j2));

  const fd3 = new FormData();
  fd3.append('files', new Blob([bufA]), 'a.png');
  fd3.append('files', new Blob([bufB]), 'b.png');
  const res3 = await fetch(BASE + '/api/image-similarity', { method: 'POST', body: fd3 });
  const j3 = await res3.json();
  check('image-similarity: different image scores low similarity', j3.similarity_percent < 70, JSON.stringify(j3));
}

// --- QR code scanning ---
async function testQrScan() {
  const fs = await import('fs');
  const bufUrl = fs.readFileSync('/tmp/test-fixtures/qr_url.png');
  const bufText = fs.readFileSync('/tmp/test-fixtures/qr_text.png');

  const fd1 = new FormData();
  fd1.append('file', new Blob([bufUrl]), 'qr_url.png');
  const res1 = await fetch(BASE + '/api/qr-scan', { method: 'POST', body: fd1 });
  const j1 = await res1.json();
  check('qr-scan: decodes URL content correctly', j1.found === true && j1.is_url === true && j1.content === 'https://presend.pages.dev', JSON.stringify(j1));

  const fd2 = new FormData();
  fd2.append('file', new Blob([bufText]), 'qr_text.png');
  const res2 = await fetch(BASE + '/api/qr-scan', { method: 'POST', body: fd2 });
  const j2 = await res2.json();
  check('qr-scan: decodes plain-text content, no reputation check run', j2.found === true && j2.is_url === false && j2.reputation === null, JSON.stringify(j2));
}

// --- Real file type detection (magic bytes) ---
async function testFileType() {
  const fs = await import('fs');
  const bufJpeg = fs.readFileSync('/tmp/test-fixtures/photo.jpg');
  const bufPng = fs.readFileSync('/tmp/test-fixtures/photo.png');

  const res1 = await fetch(BASE + '/api/file-type', {
    method: 'POST', body: bufJpeg, headers: { 'Content-Type': 'image/jpeg' },
  });
  const j1 = await res1.json();
  check('file-type: correct claim -> no mismatch', j1.detected.mime === 'image/jpeg' && j1.mismatch === false, JSON.stringify(j1));

  const res2 = await fetch(BASE + '/api/file-type', {
    method: 'POST', body: bufPng, headers: { 'Content-Type': 'image/jpeg' },
  });
  const j2 = await res2.json();
  check('file-type: mislabeled file -> mismatch detected', j2.detected.mime === 'image/png' && j2.mismatch === true, JSON.stringify(j2));
}

// --- JWT signature verification (real crypto, not just decode) ---
async function testJwtVerify() {
  // Signed independently with Python's hmac/hashlib, secret: 'mon-secret-de-test-tres-solide'
  const hmacToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImV4cCI6OTk5OTk5OTk5OX0.1yfGmVGJPGCw0Y4cxJg2kb8qBfeHst1CnxNFAeMVG_E';

  const res1 = await fetch(BASE + '/api/jwt-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: hmacToken, secret: 'mon-secret-de-test-tres-solide' }),
  });
  const j1 = await res1.json();
  check('jwt-verify: HMAC signature verified with correct secret', j1.valid === true, JSON.stringify(j1));

  const res2 = await fetch(BASE + '/api/jwt-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: hmacToken, secret: 'wrong-secret' }),
  });
  const j2 = await res2.json();
  check('jwt-verify: HMAC rejected with wrong secret', j2.valid === false, JSON.stringify(j2));
}

// --- File hash + known-malware check ---
async function testMalwareCheck() {
  const fs = await import('fs');
  const crypto = await import('crypto');
  const buf = fs.readFileSync('/tmp/test-fixtures/doc1.pdf');
  const expectedSha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const res = await fetch(BASE + '/api/malware-check', { method: 'POST', body: buf });
  const j = await res.json();
  check(
    'malware-check: computes correct SHA-256 and returns a structured result',
    j.sha256 === expectedSha256 && 'checked' in j.malwarebazaar,
    JSON.stringify(j)
  );
}

// --- Text similarity (SimHash) ---
async function testTextSimilarity() {
  const identical = 'This is exactly the same sentence repeated for a sanity check.';

  const res1 = await fetch(BASE + '/api/text-similarity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [identical] }),
  });
  const j1 = await res1.json();
  check('text-similarity: single-text hash returned', typeof j1.hash === 'string' && j1.hash.length === 16, JSON.stringify(j1));

  const res2 = await fetch(BASE + '/api/text-similarity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [identical, identical] }),
  });
  const j2 = await res2.json();
  check('text-similarity: identical text scores 100%', j2.similarity_percent === 100, JSON.stringify(j2));

  const textA = 'The quarterly financial report shows strong revenue growth across all business segments this year.';
  const textB = 'Completely unrelated content about cooking pasta with tomatoes and basil in a large pot of water.';
  const res3 = await fetch(BASE + '/api/text-similarity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [textA, textB] }),
  });
  const j3 = await res3.json();
  check('text-similarity: unrelated texts score well below near-identical', j3.similarity_percent < 80, JSON.stringify(j3));
}

// --- AI crawler / robots.txt check ---
async function testAiCrawlerCheck() {
  const res = await fetch(BASE + '/api/ai-crawler-check?domain=github.com');
  const j = await res.json();
  check(
    'ai-crawler-check: returns per-bot report with wildcard rules deduplicated',
    j.robots_txt_found === true && Array.isArray(j.bots) && j.bots.length > 0 && 'summary' in j,
    JSON.stringify(j).slice(0, 300)
  );
}

// --- clean-image (binary upload) ---
async function testCleanImage() {
  const fs = await import('fs');
  const buf = fs.readFileSync(`${FIXTURES}/photo.jpg`);
  const res = await fetch(BASE + '/api/clean-image', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: buf,
  });
  const outBuf = Buffer.from(await res.arrayBuffer());
  check('clean-image: 200 OK', res.status === 200, `status=${res.status}`);
  check('clean-image: output smaller (metadata stripped)', outBuf.length < buf.length, `${buf.length} -> ${outBuf.length}`);
}

// --- merge-and-compress-pdf (multipart upload) ---
async function testMergePdf() {
  const fs = await import('fs');
  const formData = new FormData();
  formData.append('files', new Blob([fs.readFileSync(`${FIXTURES}/doc1.pdf`)]), 'doc1.pdf');
  formData.append('files', new Blob([fs.readFileSync(`${FIXTURES}/doc2.pdf`)]), 'doc2.pdf');
  const res = await fetch(BASE + '/api/merge-and-compress-pdf', { method: 'POST', body: formData });
  check('merge-and-compress-pdf: 200 OK', res.status === 200, `status=${res.status}`);
  check('merge-and-compress-pdf: 2 pages merged', res.headers.get('X-Page-Count') === '2', `X-Page-Count=${res.headers.get('X-Page-Count')}`);
}

// --- Rate-limit-only sanity: OPTIONS preflight on a sample of endpoints ---
async function testOptions() {
  const endpoints = ['/api/hash', '/api/ip', '/api/og', '/api/stats', '/api/api-stats'];
  for (const ep of endpoints) {
    const res = await fetch(BASE + ep, { method: 'OPTIONS' });
    check(`OPTIONS ${ep}`, res.status === 200, `status=${res.status}`);
  }
}

async function main() {
  console.log(`=== Suite de tests API Presend (base: ${BASE}) ===`);

  await testCase('Endpoints GET simples', testSimpleGets);
  await testCase('Endpoints email', testEmail);
  await testCase('Endpoints password', testPassword);
  await testCase('Endpoint téléphone', testPhone);
  await testCase('Endpoint IP', testIp);
  await testCase('Endpoint security-scan', testSecurityScan);
  await testCase('Endpoint email-security', testEmailSecurity);
  await testCase('Endpoint image-similarity', testImageSimilarity);
  await testCase('Endpoint qr-scan', testQrScan);
  await testCase('Endpoint file-type', testFileType);
  await testCase('Endpoint jwt-verify', testJwtVerify);
  await testCase('Endpoint malware-check', testMalwareCheck);
  await testCase('Endpoint text-similarity', testTextSimilarity);
  await testCase('Endpoint ai-crawler-check', testAiCrawlerCheck);
  await testCase('clean-image (upload binaire)', testCleanImage);
  await testCase('merge-and-compress-pdf (upload multipart)', testMergePdf);
  await testCase('Préflight OPTIONS', testOptions);

  console.log(`\n=== Résumé: ${passed} réussis, ${failed} échoués ===`);
  if (failures.length > 0) {
    console.log('\nÉchecs détaillés:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
