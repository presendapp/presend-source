// GET /api/tx-decode?tx=<base64-encoded protobuf TxRaw bytes>
//
// Decodes a raw, signed Cosmos SDK transaction (the TxRaw protobuf
// envelope: body + auth_info + signatures) into readable JSON, without
// any external dependency -- a hand-rolled protobuf wire-format reader,
// not a generated client from .proto files.
//
// Where to get the input: any Cosmos chain's CometBFT RPC `/block`
// endpoint returns `result.block.data.txs[]` as exactly this format
// (base64 raw tx bytes) -- same for `tx_search`. It's also what you get
// broadcasting a signed tx before it's included in a block.
//
// Scope: the TxRaw envelope itself (messages, fee, gas, signer info,
// signatures) is always decoded. Message *contents* are decoded for the
// dozen or so most common message types across bank/staking/gov/authz;
// anything else is returned as its type URL plus raw hex, honestly
// labeled as "not decoded" rather than silently dropped or guessed at.
//
// MsgExec (authz) can contain other messages, including another MsgExec,
// nested arbitrarily deep -- decoding follows this recursively but stops
// at MAX_EXEC_DEPTH and reports the cutoff rather than recursing
// unboundedly on a crafted or corrupted input.
//
// No network calls -- everything here is local computation on the bytes
// you provide, so there's no SSRF surface and no rate-limit-worthy cost
// beyond CPU for a single request.

async function checkRateLimit(env, clientIP, bucket) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 20) return false;
    // Écriture échantillonnée (1 sur 5) pour économiser le quota KV --
    // légèrement moins précis en rafale, mais protège toujours contre un abus soutenu.
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota dépassé -- ne doit jamais faire planter la requête.
    return true;
  }

  try {
    if (Math.random() < 0.1) {
      const today = new Date().toISOString().split('T')[0];
      const visitKey = `api-visits:tx-decode:${today}`;
      const visits = await env.PRESEND_ANALYTICS.get(visitKey);
      await env.PRESEND_ANALYTICS.put(visitKey, ((visits ? parseInt(visits) : 0) + 10).toString());
    }
  } catch (e) { /* tracking best-effort */ }

  return true;
}

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const MAX_TX_B64_LENGTH = 200000; // generous for a real tx; bounds worst-case parse work
const MAX_EXEC_DEPTH = 6; // caps recursive MsgExec unpacking; deeper nesting is reported, not decoded

// ---------- low-level protobuf wire-format reader ----------

function readVarint(bytes, pos) {
  let result = 0n;
  let shift = 0n;
  while (true) {
    if (pos >= bytes.length) throw new Error('Unexpected end of input while reading varint');
    const byte = bytes[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 70n) throw new Error('Varint too long (possibly malformed input)');
  }
  return [result, pos];
}

// Parses a flat protobuf message into { fieldNumber -> [{ wireType, value }] }.
// wireType 0 (varint) -> BigInt. wireType 2 (length-delimited) -> Uint8Array.
// wireType 1/5 (fixed64/32) -> raw Uint8Array, unused by any field we decode here.
function parseFields(bytes) {
  const fields = new Map();
  let pos = 0;
  while (pos < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, pos);
    const fieldNumber = Number(tag >> 3n);
    const wireType = Number(tag & 0x7n);
    pos = afterTag;

    let value;
    if (wireType === 0) {
      const [v, newPos] = readVarint(bytes, pos);
      value = v;
      pos = newPos;
    } else if (wireType === 2) {
      const [len, afterLen] = readVarint(bytes, pos);
      const lenNum = Number(len);
      if (lenNum < 0 || afterLen + lenNum > bytes.length) {
        throw new Error(`Length-delimited field ${fieldNumber} exceeds input bounds`);
      }
      value = bytes.slice(afterLen, afterLen + lenNum);
      pos = afterLen + lenNum;
    } else if (wireType === 1) {
      if (pos + 8 > bytes.length) throw new Error('Unexpected end of input while reading fixed64');
      value = bytes.slice(pos, pos + 8);
      pos += 8;
    } else if (wireType === 5) {
      if (pos + 4 > bytes.length) throw new Error('Unexpected end of input while reading fixed32');
      value = bytes.slice(pos, pos + 4);
      pos += 4;
    } else {
      throw new Error(`Unsupported wire type ${wireType} for field ${fieldNumber}`);
    }

    if (!fields.has(fieldNumber)) fields.set(fieldNumber, []);
    fields.get(fieldNumber).push({ wireType, value });
  }
  return fields;
}

const decoder = new TextDecoder();
function utf8(bytes) { return decoder.decode(bytes); }
function firstValue(fields, num) { const arr = fields.get(num); return arr ? arr[0].value : undefined; }
function str(fields, num) { const v = firstValue(fields, num); return v instanceof Uint8Array ? utf8(v) : ''; }
function varintStr(fields, num) { const v = firstValue(fields, num); return v !== undefined ? v.toString() : '0'; }
function repeated(fields, num) { const arr = fields.get(num); return arr ? arr.map((e) => e.value) : []; }

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64) {
  const binary = atob(b64.replace(/ /g, '+'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------- shared submessage decoders ----------

function decodeCoin(bytes) {
  const f = parseFields(bytes);
  return { denom: str(f, 1), amount: str(f, 2) };
}
function decodeCoins(byteArrays) { return byteArrays.map(decodeCoin); }

function decodeInputOutput(bytes) {
  const f = parseFields(bytes);
  return { address: str(f, 1), coins: decodeCoins(repeated(f, 2)) };
}

// ---------- Msg decoders (cosmos.bank / staking / gov / authz) ----------

function decodeMsgSend(bytes) {
  const f = parseFields(bytes);
  return { from_address: str(f, 1), to_address: str(f, 2), amount: decodeCoins(repeated(f, 3)) };
}

function decodeMsgMultiSend(bytes) {
  const f = parseFields(bytes);
  return { inputs: repeated(f, 1).map(decodeInputOutput), outputs: repeated(f, 2).map(decodeInputOutput) };
}

function decodeMsgDelegateLike(bytes) {
  const f = parseFields(bytes);
  const amountBytes = firstValue(f, 3);
  return {
    delegator_address: str(f, 1),
    validator_address: str(f, 2),
    amount: amountBytes instanceof Uint8Array ? decodeCoin(amountBytes) : null,
  };
}

function decodeMsgBeginRedelegate(bytes) {
  const f = parseFields(bytes);
  const amountBytes = firstValue(f, 4);
  return {
    delegator_address: str(f, 1),
    validator_src_address: str(f, 2),
    validator_dst_address: str(f, 3),
    amount: amountBytes instanceof Uint8Array ? decodeCoin(amountBytes) : null,
  };
}

function decodeMsgCancelUnbondingDelegation(bytes) {
  const f = parseFields(bytes);
  const amountBytes = firstValue(f, 3);
  return {
    delegator_address: str(f, 1),
    validator_address: str(f, 2),
    amount: amountBytes instanceof Uint8Array ? decodeCoin(amountBytes) : null,
    creation_height: varintStr(f, 4),
  };
}

const VOTE_OPTIONS = { 0: 'UNSPECIFIED', 1: 'YES', 2: 'ABSTAIN', 3: 'NO', 4: 'NO_WITH_VETO' };

function decodeMsgWithdrawDelegatorReward(bytes) {
  const f = parseFields(bytes);
  return {
    delegator_address: str(f, 1),
    validator_address: str(f, 2),
    note: 'The actual withdrawn amount is not carried in this message -- it is emitted as a transaction event, not decodable from the message bytes alone.',
  };
}

function decodeMsgVote(bytes) {
  const f = parseFields(bytes);
  const optionNum = firstValue(f, 3);
  return {
    proposal_id: varintStr(f, 1),
    voter: str(f, 2),
    option: optionNum !== undefined ? (VOTE_OPTIONS[Number(optionNum)] || `UNKNOWN(${optionNum})`) : undefined,
  };
}

function decodeMsgGrant(bytes) {
  const f = parseFields(bytes);
  return {
    granter: str(f, 1),
    grantee: str(f, 2),
    note: 'Grant authorization contents not decoded in this version -- shown as granter/grantee only.',
  };
}

function decodeMsgRevoke(bytes) {
  const f = parseFields(bytes);
  return { granter: str(f, 1), grantee: str(f, 2), msg_type_url: str(f, 3) };
}

function decodeMsgExec(bytes, depth) {
  const f = parseFields(bytes);
  const grantee = str(f, 1);
  const innerMsgBytes = repeated(f, 2);

  if (depth >= MAX_EXEC_DEPTH) {
    return {
      grantee,
      msgs: innerMsgBytes.map(() => ({ decoded: false, note: `Nesting depth limit (${MAX_EXEC_DEPTH}) reached -- not decoded further.` })),
    };
  }
  return { grantee, msgs: innerMsgBytes.map((b) => decodeAny(b, depth + 1)) };
}

const MSG_DECODERS = {
  '/cosmos.bank.v1beta1.MsgSend': decodeMsgSend,
  '/cosmos.bank.v1beta1.MsgMultiSend': decodeMsgMultiSend,
  '/cosmos.staking.v1beta1.MsgDelegate': decodeMsgDelegateLike,
  '/cosmos.staking.v1beta1.MsgUndelegate': decodeMsgDelegateLike,
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': decodeMsgBeginRedelegate,
  '/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation': decodeMsgCancelUnbondingDelegation,
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': decodeMsgWithdrawDelegatorReward,
  '/cosmos.gov.v1beta1.MsgVote': decodeMsgVote,
  '/cosmos.gov.v1.MsgVote': decodeMsgVote,
  '/cosmos.authz.v1beta1.MsgGrant': decodeMsgGrant,
  '/cosmos.authz.v1beta1.MsgRevoke': decodeMsgRevoke,
  '/cosmos.authz.v1beta1.MsgExec': (bytes, depth) => decodeMsgExec(bytes, depth),
};

function decodeMessage(typeUrl, bytes, depth) {
  const decodeFn = MSG_DECODERS[typeUrl];
  if (!decodeFn) {
    return { type: typeUrl, decoded: false, note: 'Message type not yet supported by this decoder.', raw_hex: bytesToHex(bytes) };
  }
  try {
    return { type: typeUrl, decoded: true, ...decodeFn(bytes, depth) };
  } catch (e) {
    return { type: typeUrl, decoded: false, note: `Decode error: ${e.message}`, raw_hex: bytesToHex(bytes) };
  }
}

function decodeAny(bytes, depth) {
  const f = parseFields(bytes);
  const typeUrl = str(f, 1);
  const value = firstValue(f, 2);
  return decodeMessage(typeUrl, value instanceof Uint8Array ? value : new Uint8Array(0), depth);
}

// ---------- TxRaw envelope ----------

function decodeTxBody(bytes) {
  const f = parseFields(bytes);
  return {
    messages: repeated(f, 1).map((b) => decodeAny(b, 0)),
    memo: str(f, 2),
    timeout_height: varintStr(f, 3),
  };
}

function decodePublicKey(anyBytes) {
  const f = parseFields(anyBytes);
  const typeUrl = str(f, 1);
  const value = firstValue(f, 2);
  let keyHex = null;
  if (value instanceof Uint8Array) {
    try {
      const kf = parseFields(value);
      const rawKey = firstValue(kf, 1);
      if (rawKey instanceof Uint8Array) keyHex = bytesToHex(rawKey);
    } catch (e) { /* leave keyHex null on malformed pubkey wrapper */ }
  }
  return { type: typeUrl, key_hex: keyHex };
}

function decodeSignerInfo(bytes) {
  const f = parseFields(bytes);
  const pubKeyBytes = firstValue(f, 1);
  return {
    public_key: pubKeyBytes instanceof Uint8Array ? decodePublicKey(pubKeyBytes) : null,
    sequence: varintStr(f, 3),
  };
}

function decodeFee(bytes) {
  const f = parseFields(bytes);
  return {
    amount: decodeCoins(repeated(f, 1)),
    gas_limit: varintStr(f, 2),
    payer: str(f, 3),
    granter: str(f, 4),
  };
}

function decodeAuthInfo(bytes) {
  const f = parseFields(bytes);
  const feeBytes = firstValue(f, 2);
  return {
    signer_infos: repeated(f, 1).map(decodeSignerInfo),
    fee: feeBytes instanceof Uint8Array ? decodeFee(feeBytes) : null,
  };
}

function decodeTxRaw(bytes) {
  const f = parseFields(bytes);
  const bodyBytes = firstValue(f, 1);
  const authInfoBytes = firstValue(f, 2);
  return {
    body: bodyBytes instanceof Uint8Array ? decodeTxBody(bodyBytes) : null,
    auth_info: authInfoBytes instanceof Uint8Array ? decodeAuthInfo(authInfoBytes) : null,
    signatures: repeated(f, 3).map(bytesToHex),
  };
}

// ---------- HTTP handlers ----------

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'tx-decode');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const tx = (searchParams.get('tx') || '').trim();

  if (!tx) {
    return new Response(JSON.stringify({
      usage: 'GET /api/tx-decode?tx=<base64-encoded Cosmos SDK TxRaw bytes>',
      note: 'Get this from any Cosmos chain\'s CometBFT RPC /block endpoint (result.block.data.txs[]) or /tx_search -- same base64 raw tx format. Decodes the full envelope (messages, fee, gas, signer info, signatures); message contents are decoded for common bank/staking/gov/authz types, others returned as type + raw hex.',
      supported_message_types: Object.keys(MSG_DECODERS),
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (tx.length > MAX_TX_B64_LENGTH) {
    return new Response(JSON.stringify({ error: `Input too large (max ${MAX_TX_B64_LENGTH} base64 chars).` }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let bytes;
  try {
    bytes = base64ToBytes(tx);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid base64 input.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const decoded = decodeTxRaw(bytes);
    return new Response(JSON.stringify({ tx_bytes_length: bytes.length, ...decoded }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not decode input as a Cosmos SDK TxRaw.', detail: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
