export interface PermissionOptions {
  ownerJid?: string;
  owners?: (string | number)[];
  premium?: (string | number)[];
  admins?: (string | number)[];
  db?: { users?: Record<string, { premium?: boolean; admin?: boolean }> };
}

interface MinimalSock {
  user?: { id?: string };
  sendMessage?: (jid: string, content: unknown) => Promise<unknown>;
}

export class Notifier {
  private sock: MinimalSock | null;
  private ownerJid: string;
  private queue: string[] = [];
  private sending = false;

  constructor(sock: MinimalSock | null, ownerJid: string) {
    this.sock = sock;
    this.ownerJid = ownerJid;
  }

  async send(text: string): Promise<void> {
    if (!this.ownerJid || !this.sock) return;
    this.queue.push(text);
    if (!this.sending) void this.process();
  }

  private async process(): Promise<void> {
    this.sending = true;
    while (this.queue.length > 0) {
      const msg = this.queue.shift() as string;
      try {
        await this.sock?.sendMessage?.(this.ownerJid, { text: msg });
      } catch {  }
      await new Promise((r) => setTimeout(r, 1000));
    }
    this.sending = false;
  }
}

function normList(list: unknown): string[] {
  return ((list || []) as (string | number)[]).map((x) => String(x).split("@")[0]);
}

export type PermissionLevel = "owner" | "premium" | "admin" | "user";

export function getPermission(sender: unknown, opts: PermissionOptions = {}): PermissionLevel {
  const num = String(sender || "").split("@")[0];
  if (opts.ownerJid && (sender === opts.ownerJid || num === String(opts.ownerJid).split("@")[0])) return "owner";
  const owners = normList(opts.owners);
  if (owners.includes(num) || owners.includes(String(sender))) return "owner";
  if (normList(opts.premium).includes(num)) return "premium";
  if (normList(opts.admins).includes(num)) return "admin";
  const rec = opts.db && opts.db.users ? opts.db.users[String(sender)] : undefined;
  if (rec && rec.premium) return "premium";
  if (rec && rec.admin) return "admin";
  return "user";
}

export function isOwner(sender: unknown, opts: PermissionOptions = {}): boolean {
  return getPermission(sender, opts) === "owner";
}

export function isPremium(sender: unknown, opts: PermissionOptions = {}): boolean {
  const perm = getPermission(sender, opts);
  return perm === "owner" || perm === "premium";
}

interface GroupParticipant {
  id?: string;
  admin?: string | boolean | null;
}

interface GroupMetadataLike {
  participants?: GroupParticipant[];
}

export function isAdmin(sender: unknown, groupMetadata?: GroupMetadataLike | null): boolean {
  if (!groupMetadata?.participants) return false;
  const senderJid = String(sender).replace(/:\d+/, "");
  return groupMetadata.participants.some((p) => {
    const pJid = p.id?.replace(/:\d+/, "") || "";
    return (pJid === senderJid || p.id === sender) && !!p.admin;
  });
}

export function isBotAdmin(groupMetadata: GroupMetadataLike | null | undefined, sock?: { user?: { id?: string } } | null): boolean {
  if (!groupMetadata?.participants) return false;
  const botJid = sock?.user?.id?.replace(/:\d+/, "") || "";
  return groupMetadata.participants.some((p) => {
    const pJid = p.id?.replace(/:\d+/, "") || "";
    return (pJid === botJid || p.id === sock?.user?.id) && !!p.admin;
  });
}
