// GET /api/phone-verify?number=+14155552671
// GET /api/phone-verify?number=4155552671&country=US
//
// Validates and formats a phone number via libphonenumber-js (vendored
// locally, same library used by tools/phone-validator.html). If no
// "country" hint is given for a number without a leading "+", the caller's
// own IP-derived country (via Cloudflare's request.cf — see /api/ip) is
// used as the default, so a bare local-format number can still resolve
// correctly in the common case.

import * as PhoneNumberNS from '../../vendor/libphonenumber-js.min.js';
import { checkRateLimit } from '../_shared/rate-limit.js';
const { parsePhoneNumberFromString } = PhoneNumberNS.default || PhoneNumberNS;

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

// Same mapping as tools/phone-validator.html, for consistency across the product.
function getNumberType(type) {
  const types = {
    MOBILE: 'Mobile', FIXED_LINE: 'Fixed line', FIXED_LINE_OR_MOBILE: 'Fixed or mobile',
    PREMIUM_RATE: 'Premium rate', TOLL_FREE: 'Toll-free', SHARED_COST: 'Shared cost',
    VOIP: 'VoIP', PERSONAL_NUMBER: 'Personal', PAGER: 'Pager', UAN: 'UAN',
    UNKNOWN: 'Unknown', VOICEMAIL: 'Voicemail',
  };
  return types[type] || type || 'Unknown';
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'phoneverify', { limit: 30, isTest: request.headers.get('X-Presend-Test') === '1', trackVisits: true });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const number = (searchParams.get('number') || '').trim();
  let defaultCountry = (searchParams.get('country') || '').trim().toUpperCase() || undefined;

  if (!number) {
    return new Response(JSON.stringify({
      usage: 'GET /api/phone-verify?number=%2B14155552671 (or ?number=4155552671&country=US)',
      note: "If \"country\" is omitted and the number has no leading +, the caller's IP-derived country (via Cloudflare edge geolocation) is used as the default.",
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // Only fall back to IP-inferred country when the number doesn't already
  // carry a "+" prefix — a "+"-led number is self-describing (its own
  // country code determines the country) and doesn't need or use a default.
  let ipInferredCountry = null;
  if (!defaultCountry && !number.startsWith('+')) {
    const cf = request.cf || {};
    if (cf.country) {
      ipInferredCountry = cf.country;
      defaultCountry = cf.country;
    }
  }

  try {
    const phoneNumber = parsePhoneNumberFromString(number, defaultCountry);

    if (!phoneNumber) {
      return new Response(JSON.stringify({
        number, valid: false, reason: 'unparseable',
        default_country_used: defaultCountry || null,
        ip_inferred_country: ipInferredCountry,
      }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() } });
    }

    const isValid = phoneNumber.isValid();

    return new Response(JSON.stringify({
      number,
      valid: isValid,
      country: phoneNumber.country || null,
      country_calling_code: phoneNumber.countryCallingCode || null,
      type: isValid ? getNumberType(phoneNumber.getType()) : null,
      formats: isValid ? {
        e164: phoneNumber.format('E.164'),
        international: phoneNumber.format('INTERNATIONAL'),
        national: phoneNumber.format('NATIONAL'),
        uri: phoneNumber.getURI(),
      } : null,
      default_country_used: defaultCountry || null,
      ip_inferred_country: ipInferredCountry,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not parse this number.', detail: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
