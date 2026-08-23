export function isPublicProfileUrl(value: string): boolean {
  const canonical = value.split('|', 1)[0];
  try {
    const parsed = new URL(canonical);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return hostname.length > 0 && !isPrivateHostname(hostname);
  } catch {
    return false;
  }
}

function isPrivateHostname(hostname: string): boolean {
  const isIpv6 = hostname.includes(':');
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || (isIpv6 && (
      hostname === '::'
      || hostname === '::1'
      || hostname.startsWith('fc')
      || hostname.startsWith('fd')
      || /^fe[89ab]/.test(hostname)
    ))
  ) {
    return true;
  }

  const ipv4 = parseIpv4(hostname) ?? parseMappedIpv4(hostname);
  return ipv4 ? isPrivateIpv4(ipv4) : false;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every(octet => octet >= 0 && octet <= 255) ? octets : null;
}

function parseMappedIpv4(hostname: string): number[] | null {
  const match = hostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return match ? parseIpv4(match[1]) : null;
}

function isPrivateIpv4([first, second]: number[]): boolean {
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}
