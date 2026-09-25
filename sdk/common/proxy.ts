import { need } from "../loader.js";

export interface ProxyOptions {
  proxy?: string;
  target?: string;
  url?: string;
  [key: string]: unknown;
}

export function getProxyUrl(opts: ProxyOptions = {}): string | null {
  if (opts.proxy) return opts.proxy;
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    null;
  if (fromEnv) return fromEnv;
  return null;
}

export function parseNoProxy(): string[] {
  const raw = process.env.NO_PROXY || process.env.no_proxy || "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function shouldProxy(targetUrl: string): boolean {
  const list = parseNoProxy();
  if (list.length === 0) return true;
  let host = "";
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    host = String(targetUrl).toLowerCase();
  }
  const targetWithDots = `.${host}`;
  for (const entryRaw of list) {
    const entry = entryRaw.toLowerCase().trim();
    if (!entry) continue;
    if (entry === "*") return false;
    if (entry.startsWith(".")) {
      if (host === entry.slice(1) || targetWithDots.endsWith(entry)) return false;
    } else if (host === entry) {
      return false;
    } else if (targetWithDots.endsWith(`.${entry}`)) {
      return false;
    } else if (host.includes(entry)) {
      return false;
    }
    if (entry.includes("*")) {
      const re = new RegExp(`^${entry.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`);
      if (re.test(host)) return false;
    }
  }
  return true;
}

export function normalizeProxyUrl(url: unknown): string | null {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  if (!/^\w+:\/\//.test(u)) u = `http://${u}`;
  try {
    new URL(u);
    return u;
  } catch {
    return null;
  }
}

export function getProxyAgent(targetUrl = "https://web.whatsapp.com", opts: ProxyOptions = {}): unknown {
  const raw = getProxyUrl(opts);
  const proxyUrl = normalizeProxyUrl(raw);
  if (!proxyUrl) return undefined;
  if (!shouldProxy(targetUrl)) return undefined;
  try {
    const { HttpsProxyAgent } = need("https-proxy-agent");
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    try {
      const { HttpProxyAgent } = need("https-proxy-agent");
      return new HttpProxyAgent(proxyUrl);
    } catch {  }
    return undefined;
  }
}

export function createProxyAgent(opts: ProxyOptions = {}): unknown {
  const target = (opts.target as string) || (opts.url as string) || "https://web.whatsapp.com";
  return getProxyAgent(target, opts);
}

export function getFetchAgent(targetUrl: string, opts: ProxyOptions = {}): unknown {
  return getProxyAgent(targetUrl, opts);
}

export async function proxyFetch(url: string, opts: RequestInit & ProxyOptions = {}): Promise<Response> {
  const proxyUrl = normalizeProxyUrl(getProxyUrl(opts));
  if (proxyUrl && shouldProxy(url)) {
    try {
      const { ProxyAgent } = need("undici");
      (opts as Record<string, unknown>).dispatcher = new ProxyAgent(proxyUrl);
    } catch {  }
  }
  return fetch(url, opts);
}
