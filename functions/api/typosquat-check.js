// GET  /api/typosquat-check?ecosystem=npm&package=lodas
// POST /api/typosquat-check  { "ecosystem": "npm", "packages": ["lodas", ...] }  (batch, max MAX_BATCH)
//
// Checks a package name against a curated list of well-known npm/PyPI
// packages using Damerau-Levenshtein edit distance. Flags names that
// are suspiciously close (1-2 edits) to a popular package -- the
// classic typosquatting pattern (publish "lodas" hoping someone
// fat-fingers "npm install lodas" instead of "lodash").
//
// The reference list is a curated ~200-name list of genuinely
// well-known packages per ecosystem, not a scraped "top N by
// downloads" feed -- deliberately smaller and hand-maintained rather
// than exhaustive, since typosquatting attacks specifically target
// the most famous names, and a stale or noisy "top 5000" list would
// produce more false positives than a focused one. This is a real
// tradeoff, not hidden: the list needs periodic manual review to stay
// current, and won't catch typos of a mid-popularity package.
//
// Complements vulnerability-check: "is this exact package/version
// vulnerable" plus "does this package name itself look like a typo
// of something popular" together cover two different supply-chain
// risks with the same underlying question -- should I trust this
// dependency name I'm about to install.

// exact=true : écriture à chaque appel (+1). Utilisé pour les POST batch : peu
// fréquents, et l'échantillonnage (+5 une fois sur 5) donnait ~18 % de 429
// fantômes au 5e appel sous une limite de 10/min.
async function checkRateLimit(env, clientIP, bucket, exact = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 10) return false;
    // Écriture échantillonnée (1 sur 5) pour économiser le quota KV --
    // légèrement moins précis en rafale, mais protège toujours contre un abus soutenu.
    if (exact) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 1).toString(), { expirationTtl: 120 });
    } else if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota dépassé -- ne doit jamais faire planter la requête.
    return true;
  }
  return true;
}

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...extra };
}

// Trois lignes glissantes réutilisées (au lieu d'une matrice allouée à chaque
// comparaison) : le mode batch fait ~150 comparaisons par nom, le coût CPU
// par requête est limité sur Cloudflare.
let rowA = new Int32Array(64), rowB = new Int32Array(64), rowC = new Int32Array(64);
function damerauLevenshtein(a, b) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > 3) return 99; // trop différent, pas la peine de calculer
  if (bl + 1 > rowA.length) { rowA = new Int32Array(bl + 1); rowB = new Int32Array(bl + 1); rowC = new Int32Array(bl + 1); }
  let prev2 = rowA, prev = rowB, cur = rowC;
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
    }
    const t = prev2; prev2 = prev; prev = cur; cur = t;
  }
  return prev[bl];
}

// Seuil proportionnel à la longueur (plus court des deux noms) : sur un nom
// de 2-3 lettres, 1-2 éditions changent la moitié du nom ou plus -- "ms" et
// "qs" (parmi les paquets npm les plus téléchargés) sortaient "suspects" car à
// 1 édition de "ws". Tradeoff assumé : les noms de 3 caractères ou moins ne
// sont pas comparés approximativement.
function maxDistanceFor(a, b) {
  const len = Math.min(a.length, b.length);
  if (len <= 3) return 0;
  if (len <= 7) return 1;
  return 2;
}

// Listes organisées manuellement -- paquets véritablement emblématiques,
// pas un flux "top N par téléchargements" (voir note en tête de fichier).
const POPULAR = {
  npm: [
    'react', 'react-dom', 'vue', 'angular', 'svelte', 'jquery', 'lodash', 'underscore',
    'express', 'koa', 'fastify', 'next', 'nuxt', 'gatsby', 'webpack', 'vite', 'rollup',
    'babel', 'typescript', 'eslint', 'prettier', 'jest', 'mocha', 'chai', 'cypress',
    'axios', 'request', 'node-fetch', 'got', 'superagent', 'cross-env', 'dotenv',
    'moment', 'dayjs', 'date-fns', 'chalk', 'commander', 'yargs', 'inquirer',
    'redux', 'mobx', 'zustand', 'rxjs', 'immer', 'formik', 'yup', 'zod', 'joi',
    'classnames', 'clsx', 'styled-components', 'emotion', 'tailwindcss', 'sass',
    'nodemon', 'pm2', 'concurrently', 'husky', 'lint-staged', 'semantic-release',
    'uuid', 'nanoid', 'shortid', 'bcrypt', 'bcryptjs', 'jsonwebtoken', 'passport',
    'mongoose', 'sequelize', 'prisma', 'typeorm', 'knex', 'pg', 'mysql', 'mysql2',
    'redis', 'ioredis', 'socket.io', 'ws', 'graphql', 'apollo-server', 'body-parser',
    'cors', 'helmet', 'morgan', 'multer', 'compression', 'cookie-parser',
    'react-router', 'react-router-dom', 'vue-router', 'vuex', 'pinia',
    'webpack-cli', 'webpack-dev-server', 'babel-loader', 'css-loader', 'style-loader',
    'eslint-config-airbnb', 'eslint-plugin-react', 'stylelint', 'postcss', 'autoprefixer',
    'lerna', 'nx', 'turbo', 'rimraf', 'glob', 'minimist', 'yargs-parser',
    'debug', 'winston', 'pino', 'bunyan', 'colors', 'kleur',
    'left-pad', 'is-odd', 'is-even', 'is-array', 'is-number', 'is-string',
    'semver', 'validator', 'xss', 'sanitize-html', 'dompurify',
    'puppeteer', 'playwright', 'selenium-webdriver', 'cheerio', 'jsdom',
    'sharp', 'jimp', 'canvas', 'pdfkit', 'pdf-lib', 'exceljs', 'xlsx',
    'aws-sdk', '@aws-sdk/client-s3', 'firebase', 'firebase-admin', 'stripe',
    'nodemailer', 'sendgrid', 'twilio', 'openai', 'langchain',
    // Ajout 26 sept. 2026 : cibles réelles de typosquatting (crypto, Discord, Roblox, Electron) + faux positif sass-loader
    'electron', 'discord.js', 'ethers', 'web3', '@solana/web3.js', 'hardhat', 'bootstrap', 'react-native',
    'core-js', 'tslib', 'fs-extra', 'mongodb', 'chart.js', 'three', 'noblox.js', 'sass-loader',
  ],
  PyPI: [
    'requests', 'urllib3', 'numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn',
    'scikit-learn', 'tensorflow', 'torch', 'pytorch', 'keras', 'transformers',
    'flask', 'django', 'fastapi', 'starlette', 'uvicorn', 'gunicorn', 'tornado',
    'sqlalchemy', 'alembic', 'psycopg2', 'pymongo', 'redis', 'celery',
    'pytest', 'unittest2', 'nose', 'tox', 'coverage', 'mock',
    'setuptools', 'pip', 'wheel', 'twine', 'virtualenv', 'pipenv', 'poetry',
    'boto3', 'botocore', 'awscli', 'google-cloud-storage', 'azure-storage-blob',
    'pillow', 'opencv-python', 'imageio', 'scikit-image',
    'beautifulsoup4', 'lxml', 'scrapy', 'selenium', 'playwright',
    'pyyaml', 'toml', 'jsonschema', 'marshmallow', 'pydantic',
    'click', 'argparse', 'typer', 'rich', 'colorama', 'tqdm',
    'cryptography', 'pyjwt', 'bcrypt', 'passlib', 'paramiko',
    'jinja2', 'markupsafe', 'werkzeug', 'itsdangerous',
    'python-dateutil', 'pytz', 'arrow', 'pendulum',
    'six', 'attrs', 'dataclasses', 'typing-extensions',
    'openai', 'langchain', 'anthropic', 'huggingface-hub',
    'plotly', 'bokeh', 'streamlit', 'gradio',
    'black', 'flake8', 'pylint', 'mypy', 'isort', 'autopep8',
    'gevent', 'greenlet', 'asyncio', 'aiohttp', 'httpx',
    'django-rest-framework', 'djangorestframework', 'graphene',
    // Ajout 26 sept. 2026 : cibles réelles de typosquatting (crypto, Discord, outillage) + faux positif tomli
    'discord.py', 'python-dotenv', 'pycryptodome', 'web3', 'solana', 'ccxt', 'python-binance',
    'pyinstaller', 'pyautogui', 'certifi', 'psutil', 'openpyxl', 'pygame', 'tomli',
  ],
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

const MAX_BATCH = 100;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...corsHeaders(), ...extra } });
}

function normalizeEcosystem(raw) {
  const v = (typeof raw === 'string' ? raw : '').trim().toLowerCase();
  if (v === 'npm') return 'npm';
  if (['pypi', 'python', 'pip'].includes(v)) return 'PyPI';
  return null;
}

// Paquets légitimes vérifiés qui ressemblent à une cible de POPULAR : ne sont PAS signalés
// (known_legitimate: true). Revue du 26 sept. 2026 sur le top 15 000 PyPI et ~17 000 paquets npm-high-impact
// (tests/typosquat/top-pypi.mjs et top-npm.mjs) :
// dépôt identifiable et historique réel. Les noms douteux (tdqm, pyyml, attr, scss...) restent signalés.
const KNOWN_LEGIT = {
  npm: [
    'isarray', 'd3-array', 'gaxios', 'color', 'lz-string', 'commondir', 'enquirer', 'preact',
    'colord', 'crypt', 'ts-loader', 'motion', 'yargs-unparser', 'dargs', 'ulid', 'less-loader',
    'mquery', 'aws-cdk', 'react-dnd', '@apollo/server', 'mssql', 'jsdoc', 'tslint', 'args', 'blob',
    'scrypt-js', 'as-array', 'to-array', 'emoticon', 'stylus-loader', 'minimisted',
    'eslint-plugin-react-x', 'node-watch', 'x-is-string', 'revalidator', 'useragent', 'remotion',
    'uid-number', 'chat', 'cuid', 'scriptjs', 'electrodb', 'ejs-loader', 'commoner', 'graphiql',
    'crossvent', 'mimer', 'tslint-config-airbnb', 'ttypescript', 'test', 'jsx-loader', 'reqwest',
    'compressing', 'scss-loader', 'angular2', 'expresso', 'jslint',
  ],
  PyPI: [
    'httpx2', 'psycopg', 'installer', 'cattrs', 'pycryptodomex', 'pyaml', 'boto', 'pyte', 'scapy',
    'tensorflowjs', 'usort', 'niquests', 'graphemeu', 'gsutil', 'grapheme', 'lkml',
    'x-transformers', 'rtoml', 'gpytorch', 'unicorn', 'psycopg-c', 'nose2', 'willow', 'fastai',
    'arnparse', 'pygam', 'pyautogen', 'grequests', 'crick', 'tombi', 'pqdm', 'scrypt', 'pytd',
    'stqdm', 'torchx', 'jose', 'streamlink', 'hyper', 'vyper', 'graphyte', 'pyts', 'solara',
    'pymantic', 'pylink', 'scipp', 'ipytest', 'toronado',
  ],
};

// PyPI normalise les noms (PEP 503) : "typing_extensions", "Typing.Extensions" et
// "typing-extensions" désignent le même paquet et ne doivent pas être signalés.
function normalizeName(name, ecosystem) {
  return ecosystem === 'PyPI' ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;
}

function analyzeName(pkg, ecosystem) {
  const list = POPULAR[ecosystem];
  const norm = normalizeName(pkg, ecosystem);
  const matches = [];
  const scope = ecosystem === 'npm' && pkg.startsWith('@') ? pkg.split('/')[0] : null;
  for (const name of list) {
    // npm : un scope appartient à son propriétaire, un paquet du même scope que la cible n'est pas un typosquat.
    if (scope && name.startsWith(scope + '/')) continue;
    const target = normalizeName(name, ecosystem);
    const maxD = maxDistanceFor(norm, target);
    if (maxD === 0 || Math.abs(norm.length - target.length) > maxD) continue; // ne peut pas passer le seuil
    const d = damerauLevenshtein(norm, target);
    if (d > 0 && d <= maxD) matches.push({ name, distance: d });
  }
  matches.sort((a, b) => a.distance - b.distance);
  const exactMatch = list.some((name) => normalizeName(name, ecosystem) === norm);
  const knownLegit = !exactMatch && KNOWN_LEGIT[ecosystem].some((name) => normalizeName(name, ecosystem) === norm);
  return {
    package: pkg,
    ecosystem,
    is_known_popular_package: exactMatch,
    known_legitimate: knownLegit,
    suspicious: !exactMatch && !knownLegit && matches.length > 0,
    similar_to: matches.slice(0, 5),
  };
}

function noteFor(r) {
  if (r.is_known_popular_package) return 'This name IS one of the well-known packages checked against -- not a typo.';
  if (r.known_legitimate) return 'Name resembles a well-known package but is itself a known, legitimate package (manually reviewed) -- not flagged. Still make sure it is the one you meant.';
  if (r.suspicious) return 'Name is a near-miss of a well-known package (1 edit for 4-7 character names, 2 for 8+). Verify this is the package you meant to install, not a look-alike.';
  return 'No close match to any well-known package on this curated list. This does NOT mean the package is safe -- only that it does not resemble a famous name. Pair with vulnerability-check for known CVEs.';
}

function sourceFor(ecosystem) {
  return `Curated list of ~${POPULAR[ecosystem].length} well-known ${ecosystem} packages, checked via Damerau-Levenshtein edit distance (transpositions, omissions, insertions, substitutions), threshold scaled to name length; names of 3 characters or fewer are not fuzzy-matched. Not an exhaustive top-N-by-downloads feed.`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'typosquat-check');
  if (!allowed) return jsonResponse({ error: 'Rate limit exceeded. Max 10 requests per minute.' }, 429);

  const { searchParams } = new URL(request.url);
  const pkg = (searchParams.get('package') || '').trim().toLowerCase();
  const ecosystemRaw = (searchParams.get('ecosystem') || '').trim();
  const ecosystem = normalizeEcosystem(ecosystemRaw);

  if (!pkg || !ecosystemRaw) {
    return new Response(JSON.stringify({
      usage: 'GET /api/typosquat-check?ecosystem=npm&package=lodas',
      batch_usage: `POST /api/typosquat-check with {"ecosystem":"npm","packages":["lodas","expres"]} (max ${MAX_BATCH} names, counts as one request)`,
      note: 'Checks the package name against a curated list of well-known packages using edit distance. Supported ecosystems: npm, PyPI.',
      list_size: { npm: POPULAR.npm.length, PyPI: POPULAR.PyPI.length },
    }, null, 2), { headers: { ...JSON_HEADERS, ...corsHeaders() } });
  }
  if (!ecosystem) return jsonResponse({ error: `Unsupported ecosystem "${ecosystemRaw}". Supported: npm, PyPI.` }, 400);

  const r = analyzeName(pkg, ecosystem);
  return jsonResponse({ ...r, note: noteFor(r), source: sourceFor(ecosystem) }, 200, { 'Cache-Control': 'public, max-age=3600' });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'typosquat-check-batch', true);
  if (!allowed) return jsonResponse({ error: 'Rate limit exceeded. Max 10 requests per minute.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const usage = `Send {"ecosystem":"npm"|"pypi","packages":["name", ...]} (max ${MAX_BATCH} names).`;
  const ecosystem = normalizeEcosystem(body && body.ecosystem);
  if (!ecosystem) return jsonResponse({ error: 'Missing or unsupported ecosystem. Supported: npm, PyPI.', usage }, 400);
  const packages = body && Array.isArray(body.packages) ? body.packages : null;
  if (!packages || packages.length === 0) return jsonResponse({ error: 'Missing or empty "packages" array.', usage }, 400);
  if (packages.length > MAX_BATCH) return jsonResponse({ error: `Too many packages: ${packages.length} (max ${MAX_BATCH} per request).`, usage }, 400);

  const results = packages.map((raw) => {
    const pkg = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    // 214 = longueur max d'un nom de paquet npm ; borne aussi le coût CPU.
    if (!pkg || pkg.length > 214) return { package: raw, error: 'Invalid package name.' };
    return analyzeName(pkg, ecosystem);
  });

  return jsonResponse({
    ecosystem,
    count: results.length,
    suspicious_count: results.filter((r) => r.suspicious).length,
    results,
    source: sourceFor(ecosystem),
  }, 200, { 'Cache-Control': 'no-store' });
}
