const LOCAL_NAMES = /(^|\.)(localhost|local|test|internal|lan|home\.arpa)$/;

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (m.slice(1).some((part) => Number(part) > 255)) return false;
  return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIpv6(host: string): boolean {
  const inner = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (inner === "::1" || inner === "::") return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(inner) || /^fe[89ab][0-9a-f]?:/.test(inner)) return true;
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(inner);
  if (!mapped) return false;
  const [high, low] = [parseInt(mapped[1]!, 16), parseInt(mapped[2]!, 16)];
  return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

export function isLocalAddress(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (host.startsWith("[")) return isPrivateIpv6(host);
  return isPrivateIpv4(host) || LOCAL_NAMES.test(host);
}
