#!/usr/bin/env python3
"""Scan des affirmations publiques interdites (lecons n°1, 2, 9, 14 de PROJECT_CONTEXT.md).
Couvre : corps des issues/PR ouvertes OU commentees par presendapp, nos commentaires dedans,
README et releases de nos depots (hors forks), ET les fichiers publies par le site (pages .html
dont outils et traductions, openapi*.json, functions/mcp.js, README.md), lus dans le depot.
Ne modifie rien. Usage : python3 scripts/claims-audit.py [--local]
  --local : fichiers du depot seulement (rapide, sans GitHub), a lancer avant un commit.
Ajouter un motif ici a chaque nouvelle lecon sur une affirmation a ne plus faire."""
import json, re, subprocess, base64, sys, html
NEVER = r"(?!)"  # aucun contexte ne rend l'occurrence correcte
PATTERNS = {  # nom -> (motif, motif de contexte qui rend l'occurrence correcte)
    "ua-parser/colors presentes comme detectes": (r"ua-parser-js|colors\.js", r"cannot|can't|not detect|does not|doesn't|invisible|Corrected|Correction|\*\*not\*\*"),
    "exclusivite ('nothing else free')": (r"nothing else (free|does)|unlike every|only free (tool|api)", r"we know of"),
    "Spamhaus en contexte promotionnel": (r"spamhaus", r"terms|attribution|credit|licens|promotional copy|section 3\.2|fetch|download|drop_v4|spamhaus_drop|DROP Terms|\"source\"|maintained by The Spamhaus Project|What is Spamhaus|not on Spamhaus DROP|wraps Spamhaus DROP|passive DNS|fn_spamhaus_query"),
    "maintainer-change associe a PyPI": (r"npm/PyPI[^.\n]{0,40}maintainer|maintainer[^.\n]{0,60}(npm/PyPI|PyPI|crates)", r"npm-only|npm only|currently np|clarified|npm maintainer-change|npm dependencies with"),
    # 26 sept. : affirmations retirees des pages API (8 langues)
    "promesse de delivrabilite (MX seulement)": (r"(verif\w*|check\w*|confirm\w*|test\w*|guarantee\w*)\s+(the\s+|real\s+)?deliverability|deliverability check", r"does not|doesn't|cannot|can't|not a |no mailbox|not probe"),
    "concurrents 'separement et payants'": (r"separately and (paid|for a fee)|only separately[^.]{0,30}paid|s[ée]par[ée]ment et payant|separat und kostenpflichtig|por separado y de pago|separadamente e pagas|по отдельности и платно|個別の有料|अलग-अलग और भुगतान", NEVER),
    "exclusivite ('aucune autre API gratuite')": (r"no other free api|aucune autre api gratuite|keine andere uns bekannte kostenlose|ninguna otra api gratuita|nenhuma outra api gratuita|ни один другой известный нам бесплатный|他の無料APIは知りません|कोई अन्य मुफ़्त API", NEVER),
    "pas d'endpoint serveur pour les outils fichiers (faux)": (r"pas de point de terminaison serveur", NEVER),
    "mot de passe 'jamais transmis en entier' (faux en GET)": (r"never (sent|transmitted|logged)[^.]{0,25}(in full|full)|(sent|transmitted) in full|full password is never|jamais (envoy|transmis)[^.]{0,25}(en entier|complet)", NEVER),
    # 27 sept. : lecon 17 (forme courte oubliee dans le README npm) et lecon 20 (verdict negatif affiche chez un tiers)
    "password-breach 'k-anonymity' sans le trajet vers Presend": (r"(checkPasswordBreach|passwordBreach|password-breach(?!-checker))[^\n]{0,200}k-anonym|k-anonym[^\n]{0,200}(checkPasswordBreach|passwordBreach|password-breach(?!-checker))", r"in the URL|GET URL|query string|dans l'URL|in der URL|en la URL|na URL|passwordCheck|password-check|browser|locally|your device|only a partial hash is ever|navigateur|localement|navegador|localmente|lokal|браузер|ブラウザ|ब्राउज़र"),
    "verdict negatif de sanctions ('not sanctioned')": (r"not (OFAC[- ])?sanctioned|non sanctionn|nicht sanktioniert", r"removed|retir|never|only a positive|not proof|n'est pas une preuve|could have shown|shouldn't be displayed"),
    # 27 sept. : "no rate-limit tier walls" lu comme "pas de limite de debit" (skill-scanner #226, maes #36)
    # 27 sept. : privacy.html et speech-to-text promettaient "aucune donnee collectee/transmise" et un traitement vocal local (faux dans Chrome/Edge)
    "promesse 'aucune donnee collectee, stockee ou transmise'": (r"(do not|don.t|never) collect,? store,? (or|nor) transmit|ne collectons,? ne stockons ni ne transmettons", NEVER),
    "reconnaissance vocale presentee comme locale": (r"(speech|voice|audio|vocal|voix|dictat)[^.\n]{0,160}(medical notes|legal dictation|notes m.dicales|dict.e juridique)|(medical notes|legal dictation|notes m.dicales|dict.e juridique)[^.\n]{0,160}(speech|voice|audio|vocal|voix)", r"use an offline|offline transcription|outil de transcription hors ligne|do not use|ne l.utilisez pas"),
    # 30 sept. : "no tracking" et variantes (8 langues) alors que Web Analytics est injecte sur chaque page (288 pieds de page + 168 pages corriges)
    "promesse 'no tracking' / 'no data collection'": (r"no[- ]tracking|tracking scripts monitor|no (data collection|ip storage|third-party trackers)|kein tracking|keine nachverfolgung|keine datenerfassung|pas de suivi|sans suivi|sans tracking|sans traçage|ne suivons pas les utilisateurs|sin seguimiento|sin rastreo|ni rastreamos|sin recopilación de datos|sem rastreamento|nem rastreamos|sem coleta de dados|(нет|без|никакого) отслеживания|не отслеживаем|без сбора данных|追跡(なし|も|しません|ありません)|トラッキングなし|一切収集しません|कोई ट्रैकिंग नहीं|ट्रैक नहीं करते|कोई डेटा संग्रह नहीं|pas de stockage IP|pas de trackers tiers|keine IP-Speicherung|kein Tracker von Drittanbietern|sin almacenamiento de IP|sin rastreadores de terceros|sem armazenamento IP|sem rastreadores de terceiros|IP-хранилища|сторонних трекеров|IP ストレージ|サードパーティのトラッカーは使用しません|आईपी भंडारण नहीं|तृतीय-पक्ष ट्रैकर नहीं", r"_Edited 20\d\d-\d\d-\d\d: removed"),
    # 1er oct. : "nothing is ever uploaded" pour le site entier (8 langues, 714 pages de JSON-LD) et "pas d'endpoint serveur" (api.html x6).
    # Les formules generiques ("rien n'est jamais envoye", "アップロードは一切ありません", "nada é carregado") restent HORS motif : vraies sur 19 pages d'outils locaux.
    "promesse 'rien n'est jamais envoye' (site entier)": (r"nothing is ever uploaded|same privacy guarantee as every tool|rien n'est jamais (téléchargé|téléversé)|tous les outils de ce site\s*:|es wird nie(mals)? etwas hochgeladen|nichts wird jemals hochgeladen|wie jedes tool auf dieser seite|nada se sube (nunca|jamás)|nunca se sube nada|todas las herramientas de este sitio\s*:|nada é enviado (jamais|para servidores)|todas as ferramentas deste site\s*:|ничего никогда не (загружается|отправляется)|у всех инструментов на этом сайте|アップロードは一切行われません|すべてのツールと同じ|कुछ भी कभी अपलोड नहीं किया जाता|कभी भी कुछ भी अपलोड नहीं|हर टूल जैसी ही|no server endpoint|keinen server-endpoint|no hay endpoint de servidor|não há endpoint de servidor|нет серверного эндпоинта|कोई सर्वर एंडपॉइंट नहीं|サーバーエンドポイントはありません", r"_Edited 20\d\d-\d\d-\d\d"),
    # 30 sept. : le depot presend est prive (lien 404) ; code public dans presend-source. A RETIRER si presend redevient public.
    "lien vers le depot prive presendapp/presend": (r"github\.com/presendapp/presend(?![-\w])", NEVER),
    "limite de debit presentee comme absente": (r"rate-limit tier walls|no rate.?limits?(?![-\w])", r"per-minute rate limits apply|was ambiguous|was wrong|do have rate limits"),
}
INTERNAL = {'PROJECT_CONTEXT.md', 'STRUCTURE.md', 'ROADMAP.md', 'WORKFLOW.md', 'SECURITY_DISCLOSURES.md'}
def gh(a):
    r = subprocess.run(['gh'] + a, capture_output=True, text=True)
    try: return json.loads(r.stdout)
    except Exception: return None
texts = []
# 1. Fichiers publies par le site (versionnes uniquement)
files = subprocess.run(['git', 'ls-files', '*.html', 'openapi*.json', 'functions/mcp.js', 'README.md'],
                       capture_output=True, text=True).stdout.split()
for f in files:
    if f.startswith('vendor/') or f in INTERNAL: continue
    t = open(f, encoding='utf-8', errors='ignore').read()
    if f.endswith('.html'):
        t = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
        t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    texts.append((f"site: {f}", t))
n_local = len(texts)
# 2. GitHub (sauf --local)
seen = set()
if '--local' not in sys.argv:
    for flag in ('--author=presendapp', '--commenter=presendapp'):
        for i in gh(['search', 'issues', flag, '--include-prs', '--json', 'repository,number', '--limit', '300']) or []:
            repo, n = i['repository']['nameWithOwner'], i['number']
            if (repo, n) in seen or repo.lower().startswith('presendapp/'): continue
            seen.add((repo, n))
            it = gh(['api', f'repos/{repo}/issues/{n}', '--jq', '{b: .body, a: .user.login}']) or {}
            if it.get('a') == 'presendapp': texts.append((f"{repo}#{n} (corps)", it.get('b') or ''))
            for c in gh(['api', f'repos/{repo}/issues/{n}/comments?per_page=100']) or []:
                if c['user']['login'] == 'presendapp': texts.append((f"{repo}#{n} (commentaire {c['html_url'].split('#')[-1]})", c['body'] or ''))
    for r in gh(['repo', 'list', 'presendapp', '--limit', '100', '--json', 'name,isFork', '--jq', '[.[] | select(.isFork | not) | .name]']) or []:
        rd = gh(['api', f'repos/presendapp/{r}/readme', '--jq', '{c: .content}'])
        if rd and rd.get('c'): texts.append((f"presendapp/{r} README", base64.b64decode(rd['c']).decode('utf-8', 'ignore')))
        else: print(f"(README illisible : presendapp/{r} -> {str(rd)[:80]})")
        for x in gh(['api', f'repos/presendapp/{r}/releases?per_page=100']) or []: texts.append((f"presendapp/{r} release {x['tag_name']}", x.get('body') or ''))
hits = 0
for name, (pat, ok) in PATTERNS.items():
    for where, t in texts:
        for m in re.finditer(pat, t, re.I):
            ctx = t[max(0, m.start() - 200): m.end() + 200]
            if re.search(ok, ctx, re.I): continue
            hits += 1; print(f"[{name}] {where}\n    ...{' '.join(ctx[150:].split())[:260]}...\n")
print(f"{len(texts)} textes examines ({n_local} fichiers du site, {len(seen)} conversations), {hits} occurrence(s) a verifier.")
