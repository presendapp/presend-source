// Test hors ligne de functions/_shared/package-age.js. Usage : node tests/package-age/unit.mjs
import assert from 'node:assert/strict';
import { firstPublished, ageInDays } from '../../functions/_shared/package-age.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  OK', name); };
t('npm : time.created', () => assert.equal(firstPublished('npm', { time: { created: '2020-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' } }), '2020-01-01T00:00:00.000Z'));
t('npm : sans time -> null', () => assert.equal(firstPublished('npm', { name: 'x' }), null));
t('npm : date invalide -> null', () => assert.equal(firstPublished('npm', { time: { created: 'pas une date' } }), null));
t('pypi : plus ancien fichier, versions vides ignorees, upload_time sans Z', () => assert.equal(firstPublished('pypi', { releases: {
  '1.0': [{ upload_time_iso_8601: '2021-05-01T10:00:00.000000Z' }], '0.1': [], '0.2': [{ upload_time: '2020-03-01T00:00:00' }, { upload_time_iso_8601: '2020-03-02T00:00:00Z' }] } }), '2020-03-01T00:00:00.000Z'));
t('pypi : aucune version avec fichier -> null', () => assert.equal(firstPublished('pypi', { releases: { '0.1': [] } }), null));
t('pypi : pas de releases -> null', () => assert.equal(firstPublished('pypi', { info: {} }), null));
t('ecosysteme inconnu -> null', () => assert.equal(firstPublished('cargo', { time: { created: '2020-01-01T00:00:00Z' } }), null));
t('donnees nulles -> null', () => assert.equal(firstPublished('npm', null), null));
t('ageInDays : jours entiers ecoules', () => assert.equal(ageInDays('2026-10-01T00:00:00Z', Date.parse('2026-10-02T12:00:00Z')), 1));
t('ageInDays : moins d un jour -> 0', () => assert.equal(ageInDays('2026-10-02T00:00:00Z', Date.parse('2026-10-02T12:00:00Z')), 0));
t('ageInDays : null -> null', () => assert.equal(ageInDays(null), null));
console.log(`${n}/11 OK`);
