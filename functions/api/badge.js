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

  const base = new URL(request.url).origin;

  try {
    const [vulnRes, maintRes] = await Promise.all([
      fetch(`${base}/api/vulnerability-check?ecosystem=${encodeURIComponent(ecosystem)}&package=${encodeURIComponent(pkg)}`),
      ecosystem === 'npm'
        ? fetch(`${base}/api/maintainer-change-check?ecosystem=${encodeURIComponent(ecosystem)}&package=${encodeURIComponent(pkg)}`)
        : Promise.resolve(null),
    ]);

    const vulnData = vulnRes.ok ? await vulnRes.json() : { vulnerabilities: [] };
    const maintData = maintRes && maintRes.ok ? await maintRes.json() : { suspicious: false };

    const vulnCount = (vulnData.vulnerabilities || []).length;
    const suspicious = !!maintData.suspicious;

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
      message = 'no known issues';
      color = 'brightgreen';
    }

    return new Response(JSON.stringify({
      schemaVersion: 1,
      label: `presend: ${pkg}`,
      message,
      color,
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({
      schemaVersion: 1, label: 'presend', message: 'check failed', color: 'lightgrey'
    }), { headers: cors });
  }
}
