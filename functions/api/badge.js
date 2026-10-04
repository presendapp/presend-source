// GET /api/badge?ecosystem=npm&package=lodash
// Renvoie un badge shields.io dynamique (schéma "endpoint badge") résumant
// l'état de sécurité d'un paquet, en réutilisant nos propres endpoints
// vulnerability-check et maintainer-change-check plutôt que de dupliquer
// leur logique.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const ecosystem = url.searchParams.get('ecosystem') || 'npm';
  const pkg = url.searchParams.get('package');

  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (!pkg) {
    return new Response(JSON.stringify({
      schemaVersion: 1, label: 'presend', message: 'missing package param', color: 'lightgrey'
    }), { headers: cors });
  }

  // Sans version, vulnerability-check compte les avis de TOUTES les versions (lodash : 10,
  // dernière version : 0). Un badge se lit comme l'état actuel : on évalue une version
  // précise, la dernière publiée sur npm si elle n'est pas fournie (2026-10-01).
  let version = (url.searchParams.get('version') || '').trim();
  if (!version && ecosystem === 'npm') {
    try {
      const name = pkg.startsWith('@') ? '@' + encodeURIComponent(pkg.slice(1)) : encodeURIComponent(pkg);
      const r = await fetch(`https://registry.npmjs.org/${name}/latest`);
      if (r.ok) version = String((await r.json()).version || '');
    } catch (e) { /* version introuvable : traité juste en dessous */ }
  }
  if (!version) {
    return new Response(JSON.stringify({
      schemaVersion: 1, label: `presend: ${pkg}`,
      message: ecosystem === 'npm' ? 'check unavailable' : 'version required', color: 'lightgrey'
    }), { headers: { ...cors, 'Cache-Control': 'no-store' } });
  }

  const base = new URL(request.url).origin;

  try {
    const [vulnRes, maintRes] = await Promise.all([
      fetch(`${base}/api/vulnerability-check?ecosystem=${encodeURIComponent(ecosystem)}&package=${encodeURIComponent(pkg)}&version=${encodeURIComponent(version)}`),
      ecosystem === 'npm'
        ? fetch(`${base}/api/maintainer-change-check?ecosystem=${encodeURIComponent(ecosystem)}&package=${encodeURIComponent(pkg)}`)
        : Promise.resolve(null),
    ]);

    // Une panne, une limite de débit ou une réponse sans verdict n'est jamais un
    // « tout va bien » (leçons 20 et 27) : avant le 2026-10-01, tout échec donnait
    // « no known issues » en vert.
    const vulnData = vulnRes.ok ? await vulnRes.json() : null;
    const maintData = maintRes ? (maintRes.ok ? await maintRes.json() : null) : undefined;
    if (!vulnData || !Array.isArray(vulnData.vulnerabilities) || maintData === null
        || (maintData !== undefined && typeof maintData.suspicious !== 'boolean')) {
      return new Response(JSON.stringify({
        schemaVersion: 1, label: `presend: ${pkg}`, message: 'check unavailable', color: 'lightgrey'
      }), { headers: { ...cors, 'Cache-Control': 'no-store' } });
    }

    // Nom inexistant ou registre injoignable : jamais de vert (vulnerability-check, 4 oct. 2026).
    if (vulnData.found === false || vulnData.vulnerable === null) {
      return new Response(JSON.stringify({
        schemaVersion: 1, label: `presend: ${pkg}`,
        message: vulnData.found === false ? 'package not found' : 'check unavailable', color: 'lightgrey'
      }), { headers: { ...cors, 'Cache-Control': 'no-store' } });
    }

    const vulnCount = vulnData.vulnerabilities.length;
    const suspicious = maintData !== undefined && maintData.suspicious;

    let message, color;
    if (suspicious && vulnCount > 0) {
      message = `${vulnCount} vuln + maintainer change`;
      color = 'red';
    } else if (suspicious) {
      message = 'maintainer change detected';
      color = 'orange';
    } else if (vulnCount > 0) {
      message = `${vulnCount} known ${vulnCount === 1 ? 'vulnerability' : 'vulnerabilities'}`;
      color = 'orange';
    } else {
      // Sans contrôle de mainteneur (hors npm), on ne parle que des vulnérabilités.
      message = maintData !== undefined ? 'no known issues' : 'no known vulnerabilities';
      color = 'brightgreen';
    }

    return new Response(JSON.stringify({
      schemaVersion: 1,
      label: `presend: ${pkg}@${version}`,
      message,
      color,
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({
      schemaVersion: 1, label: 'presend', message: 'check failed', color: 'lightgrey'
    }), { headers: cors });
  }
}
