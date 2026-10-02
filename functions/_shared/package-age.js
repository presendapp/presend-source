// First publication date of a package, read from the registry document that supply-chain-check already downloads
// (no extra request). npm: packument time.created. PyPI: oldest upload_time among all files of all releases.
// PyPI limit: if early releases were deleted, the package looks younger than it is (errs towards a warning, never
// towards silence). Pure module, no imports: tests import it directly.
export function firstPublished(ecosystem, data) {
  if (!data || typeof data !== 'object') return null;
  if (ecosystem === 'npm') {
    const t = data.time && data.time.created;
    const d = t ? new Date(t) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  if (ecosystem === 'pypi') {
    let min = null;
    for (const files of Object.values(data.releases || {})) {
      for (const f of files || []) {
        const t = f && (f.upload_time_iso_8601 || (f.upload_time ? f.upload_time + 'Z' : null));
        const d = t ? new Date(t) : null;
        if (d && !Number.isNaN(d.getTime()) && (!min || d < min)) min = d;
      }
    }
    return min ? min.toISOString() : null;
  }
  return null;
}

export function ageInDays(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86400000);
}
