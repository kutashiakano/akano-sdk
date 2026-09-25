import sharp from "sharp";

export interface ProfileStats {
  label: string;
  value: string | number;
}

export type CardTheme = "dark" | "light";

export interface ThemeTokens {
  bg: string;
  surface: string;
  outline: string;
  primary: string;
  onSurface: string;
  secondary: string;
  track: string;
}

function theme(dark = true): ThemeTokens {
  return dark
    ? {
        bg: "#141218",
        surface: "#1D1B20",
        outline: "#49454F",
        primary: "#D0BCFF",
        onSurface: "#E6E0E9",
        secondary: "#CAC4D0",
        track: "#36343B"
      }
    : {
        bg: "#FEF7FF",
        surface: "#F3EDF7",
        outline: "#CAC4D0",
        primary: "#6750A4",
        onSurface: "#1D1B20",
        secondary: "#49454F",
        track: "#E6E0E9"
      };
}

async function fetchAvatar(url?: string, size = 260): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const circled = await sharp(buf)
      .resize(size, size, { fit: "cover" })
      .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`), blend: "dest-in" }])
      .png()
      .toBuffer();
    return circled;
  } catch {
    return null;
  }
}

function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortName(name: string, max = 24): string {
  const s = String(name || "User");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function baseImage(width: number, height: number, bg: string): ReturnType<typeof sharp> {
  const [r, g, b] = [parseInt(bg.slice(1, 3), 16), parseInt(bg.slice(3, 5), 16), parseInt(bg.slice(5, 7), 16)];
  return sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha: 1 } } });
}

function m3bar(x: number, y: number, w: number, h: number, ratio: number, t: ThemeTokens): string {
  const pct = Math.max(0, Math.min(1, ratio || 0));
  const fw = Math.max(h, Math.round(w * pct));
  const stop = x + fw;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${t.track}"/>`
    + `<rect x="${x}" y="${y}" width="${fw}" height="${h}" rx="${h / 2}" fill="${t.primary}"/>`
    + `<circle cx="${stop}" cy="${y + h / 2}" r="${h / 2 + 2}" fill="${t.primary}"/>`;
}

const ROBOTO = "Roboto, Arial, sans-serif";

export interface WelcomeOptions {
  avatarUrl?: string;
  theme?: CardTheme;
}

function welcomeSvg(kind: "WELCOME" | "GOODBYE", pushname: string, groupName: string, totalMember: number, t: ThemeTokens, W: number, H: number): string {
  return `<svg width="${W}" height="${H}">`
    + `<rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="28" fill="${t.surface}" stroke="${t.outline}" stroke-width="1"/>`
    + `<text x="${W / 2}" y="150" font-family="${ROBOTO}" font-size="22" letter-spacing="6" fill="${t.secondary}" text-anchor="middle">${kind}</text>`
    + `<text x="${W / 2}" y="222" font-family="${ROBOTO}" font-size="48" font-weight="700" fill="${t.onSurface}" text-anchor="middle">${esc(shortName(pushname))}</text>`
    + `<text x="${W / 2}" y="268" font-family="${ROBOTO}" font-size="24" fill="${t.secondary}" text-anchor="middle">${esc(groupName)}</text>`
    + `<rect x="${W / 2 - 90}" y="296" width="180" height="36" rx="18" fill="none" stroke="${t.outline}" stroke-width="1.5"/>`
    + `<text x="${W / 2}" y="320" font-family="${ROBOTO}" font-size="20" fill="${t.onSurface}" text-anchor="middle">${totalMember} members</text>`
    + `</svg>`;
}

export async function welcome(pushname = "User", groupName = "GROUP", totalMember = 0, opts: WelcomeOptions = {}): Promise<Buffer> {
  const W = 1000;
  const H = 440;
  const t = theme(opts.theme !== "light");
  const svg = welcomeSvg("WELCOME", pushname, groupName, totalMember, t, W, H);
  return baseImage(W, H, t.bg).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

export async function goodbye(pushname = "User", groupName = "GROUP", totalMember = 0, opts: WelcomeOptions = {}): Promise<Buffer> {
  const W = 1000;
  const H = 440;
  const t = theme(opts.theme !== "light");
  const svg = welcomeSvg("GOODBYE", pushname, groupName, totalMember, t, W, H);
  return baseImage(W, H, t.bg).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

export interface RankCard {
  name?: string;
  avatarUrl?: string;
  level?: number;
  rank?: number | string;
  xp?: number;
  maxXp?: number;
  theme?: CardTheme;
}

export async function rankCard(opts: RankCard = {}): Promise<Buffer> {
  const W = 1000;
  const H = 300;
  const t = theme(opts.theme !== "light");
  const level = opts.level ?? 1;
  const xp = Math.max(0, Number(opts.xp) || 0);
  const maxXp = Math.max(1, Number(opts.maxXp) || 100);
  const pct = Math.floor((xp / maxXp) * 100);
  const svg = `<svg width="${W}" height="${H}">`
    + `<rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="28" fill="${t.surface}" stroke="${t.outline}" stroke-width="1"/>`
    + `<circle cx="150" cy="150" r="64" fill="none" stroke="${t.outline}" stroke-width="2"/>`
    + `<text x="248" y="108" font-family="${ROBOTO}" font-size="40" font-weight="700" fill="${t.onSurface}">${esc(shortName(opts.name, 20))}</text>`
    + `<text x="248" y="150" font-family="${ROBOTO}" font-size="24" fill="${t.secondary}">Level ${level} · Rank #${esc(opts.rank ?? "-")}</text>`
    + m3bar(248, 176, 660, 12, xp / maxXp, t)
    + `<text x="248" y="228" font-family="${ROBOTO}" font-size="20" fill="${t.secondary}">${xp} / ${maxXp} XP · ${pct}%</text>`
    + `</svg>`;
  const layers: { input: Buffer; top: number; left: number }[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  const avatar = await fetchAvatar(opts.avatarUrl, 112);
  if (avatar) layers.push({ input: avatar, top: 94, left: 94 });
  return baseImage(W, H, t.bg).composite(layers).png().toBuffer();
}

export interface ProfileCard {
  name?: string;
  id?: string;
  avatarUrl?: string;
  stats?: ProfileStats[];
  footer?: string;
  theme?: CardTheme;
}

export async function profileCard(opts: ProfileCard = {}): Promise<Buffer> {
  const W = 1200;
  const H = 640;
  const t = theme(opts.theme !== "light");
  const stats = (opts.stats || []).slice(0, 6);
  const rows = stats
    .map((s, i) => {
      const y = 330 + i * 52;
      return `<text x="120" y="${y}" font-family="${ROBOTO}" font-size="24" fill="${t.secondary}">${esc(s.label)}</text>`
        + `<text x="1080" y="${y}" font-family="${ROBOTO}" font-size="24" font-weight="700" fill="${t.onSurface}" text-anchor="end">${esc(s.value)}</text>`
        + `<rect x="120" y="${y + 14}" width="960" height="1" fill="${t.outline}" opacity="0.5"/>`;
    })
    .join("");
  const svg = `<svg width="${W}" height="${H}">`
    + `<rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="28" fill="${t.surface}" stroke="${t.outline}" stroke-width="1"/>`
    + `<circle cx="200" cy="170" r="72" fill="none" stroke="${t.outline}" stroke-width="2"/>`
    + `<text x="310" y="160" font-family="${ROBOTO}" font-size="44" font-weight="700" fill="${t.onSurface}">${esc(shortName(opts.name, 18))}</text>`
    + `<text x="310" y="205" font-family="${ROBOTO}" font-size="24" fill="${t.secondary}">@${esc(opts.id || "")}</text>`
    + rows
    + `<text x="600" y="600" font-family="${ROBOTO}" font-size="20" letter-spacing="3" fill="${t.secondary}" text-anchor="middle">${esc(opts.footer || "")}</text>`
    + `</svg>`;
  const layers: { input: Buffer; top: number; left: number }[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  const avatar = await fetchAvatar(opts.avatarUrl, 130);
  if (avatar) layers.push({ input: avatar, top: 105, left: 135 });
  return baseImage(W, H, t.bg).composite(layers).png().toBuffer();
}

export interface LevelUpCard {
  name?: string;
  avatarUrl?: string;
  before?: number | string;
  after?: number | string;
  role?: string;
  xp?: number;
  maxXp?: number;
  theme?: CardTheme;
}

export async function levelUpCard(opts: LevelUpCard = {}): Promise<Buffer> {
  const W = 1200;
  const H = 420;
  const t = theme(opts.theme !== "light");
  const xp = Number(opts.xp) || 0;
  const maxXp = Number(opts.maxXp) || 1;
  const svg = `<svg width="${W}" height="${H}">`
    + `<rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="28" fill="${t.surface}" stroke="${t.outline}" stroke-width="1"/>`
    + `<text x="600" y="140" font-family="${ROBOTO}" font-size="24" letter-spacing="6" fill="${t.secondary}" text-anchor="middle">LEVEL UP</text>`
    + `<text x="600" y="225" font-family="${ROBOTO}" font-size="68" font-weight="700" fill="${t.primary}" text-anchor="middle">${esc(opts.before ?? "")} → ${esc(opts.after ?? "")}</text>`
    + `<text x="600" y="280" font-family="${ROBOTO}" font-size="26" fill="${t.secondary}" text-anchor="middle">${esc(opts.role || "")} · ${esc(opts.name || "User")}</text>`
    + m3bar(300, 310, 600, 10, xp / maxXp, t)
    + `<text x="600" y="352" font-family="${ROBOTO}" font-size="20" fill="${t.secondary}" text-anchor="middle">${xp}/${maxXp} XP</text>`
    + `</svg>`;
  return baseImage(W, H, t.bg).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}

export interface CertificateCard {
  name?: string;
  desc?: string;
  roleLevel?: string;
  theme?: CardTheme;
}

export async function certificate(opts: CertificateCard = {}): Promise<Buffer> {
  const W = 1200;
  const H = 850;
  const t = theme(opts.theme !== "light");
  const svg = `<svg width="${W}" height="${H}">`
    + `<rect x="40" y="40" width="1120" height="770" rx="28" fill="${t.surface}" stroke="${t.outline}" stroke-width="1.5"/>`
    + `<rect x="64" y="64" width="1072" height="722" rx="20" fill="none" stroke="${t.outline}" stroke-width="1" opacity="0.6"/>`
    + `<text x="600" y="200" font-family="${ROBOTO}" font-size="24" letter-spacing="6" fill="${t.secondary}" text-anchor="middle">CERTIFICATE OF ACHIEVEMENT</text>`
    + `<text x="600" y="330" font-family="Georgia,serif" font-size="72" font-weight="bold" fill="${t.onSurface}" text-anchor="middle">${esc(String(opts.name || "HERO").toUpperCase()).slice(0, 22)}</text>`
    + `<rect x="450" y="380" width="300" height="2" fill="${t.primary}"/>`
    + `<text x="600" y="440" font-family="Georgia,serif" font-size="28" font-style="italic" fill="${t.secondary}" text-anchor="middle">${esc(opts.desc || "")}</text>`
    + `<text x="600" y="520" font-family="Roboto, Arial" font-size="32" font-weight="700" fill="${t.primary}" text-anchor="middle">${esc(opts.roleLevel || "")}</text>`
    + `<text x="600" y="700" font-family="${ROBOTO}" font-size="20" letter-spacing="3" fill="${t.secondary}" text-anchor="middle">AKANO SDK</text>`
    + `</svg>`;
  return baseImage(W, H, t.bg).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}
