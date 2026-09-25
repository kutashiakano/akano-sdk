export const LINK_PATTERNS: RegExp[] = [/chat\.whatsapp\.com\/[^\s]+/gi, /https?:\/\/[^\s]*t\.me\/[^\s]+/gi, /https?:\/\/[^\s]*wa\.me\/[^\s]+/gi, /https?:\/\/[^\s]*telegram\.me\/[^\s]+/gi];
export const VRX_T = 5000;

export function isLink(text: unknown): boolean {
  if (!text) return false;
  const s = String(text);
  return LINK_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(s);
  });
}

export function isVirtex(text: unknown): boolean {
  if (!text) return false;
  return String(text).length > VRX_T;
}

export function extractLinks(text: unknown): string[] {
  if (!text) return [];
  const s = String(text);
  const links: string[] = [];
  for (const pattern of LINK_PATTERNS) {
    const matches = s.match(pattern);
    if (matches) links.push(...matches);
  }
  return [...new Set(links)];
}

export class AntiDelete {
  private recentMessages = new Map<string, unknown>();
  private MAX_SIZE = 1000;

  store(key: string, msg: unknown): void {
    this.recentMessages.set(key, msg);
    if (this.recentMessages.size > this.MAX_SIZE) {
      const firstKey = this.recentMessages.keys().next().value;
      if (firstKey !== undefined) this.recentMessages.delete(firstKey);
    }
  }

  get(key: string): unknown {
    return this.recentMessages.get(key);
  }

  delete(key: string): void {
    this.recentMessages.delete(key);
  }
}
