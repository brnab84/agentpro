import dns from 'dns/promises';
import net from 'net';
import { AppError } from './AppError.js';

// Guards against Server-Side Request Forgery: only allow http/https to PUBLIC
// hosts, blocking loopback / private / link-local / metadata addresses, and
// re-validating every redirect hop.

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true; // unknown → treat as unsafe
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||                 // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||       // CGNAT
    a >= 224                                     // multicast / reserved
  );
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fc') || low.startsWith('fd')) return true;        // ULA fc00::/7
    if (low.startsWith('fe8') || low.startsWith('fe9') ||
        low.startsWith('fea') || low.startsWith('feb')) return true;      // link-local
    const m = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);                  // IPv4-mapped
    if (m) return isPrivateIPv4(m[1]);
    return false;
  }
  return true; // not a valid IP literal
}

/** Throw unless the URL is http/https and resolves only to public addresses. */
export async function assertPublicUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new AppError('URL inválida', 422); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new AppError('Solo se permiten URLs http(s)', 422);
  }
  const host = u.hostname;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new AppError('URL no permitida (dirección interna)', 422);
    return;
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { throw new AppError('No se pudo resolver el dominio', 422); }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) {
    throw new AppError('URL no permitida (dirección interna)', 422);
  }
}

/** fetch() that validates the target and every redirect hop against SSRF. */
export async function safeFetch(url, { headers = {}, timeoutMs = 25_000, maxRedirects = 4 } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new AppError('Demasiados redirects', 422);
}
