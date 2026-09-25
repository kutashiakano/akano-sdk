import { buttons as sendWhatsAppButtons, normInteractive } from "./whatsapp.js";

export interface BuilderRow {
  kind: "reply" | "url" | "copy" | "call" | "list";
  id?: string;
  label: string;
  url?: string;
  code?: string;
  number?: string;
  title?: string;
  sections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
}

export class Buttons {
  private titleText = "";
  private subtitleText = "";
  private bodyText = "";
  private footerText = "";
  private overflowLimit: number | null = null;
  private overflowTitles = { list: "action list", button: "choose action" };
  private overflowDividers: number[] = [];
  private media: { image?: unknown; video?: unknown; title?: string } | null = null;
  private rows: BuilderRow[] = [];

  setTitle(t: string): this {
    this.titleText = String(t || "");
    return this;
  }

  setSubtitle(t: string): this {
    this.subtitleText = String(t || "");
    return this;
  }

  setBody(t: string): this {
    this.bodyText = String(t || "");
    return this;
  }

  setFooter(t: string): this {
    this.footerText = String(t || "");
    return this;
  }

  setImage(src: unknown, title?: string): this {
    this.media = { image: src, title };
    return this;
  }

  setVideo(src: unknown, title?: string): this {
    this.media = { video: src, title };
    return this;
  }

  addReply(id: string, label: string): this {
    this.rows.push({ kind: "reply", id: String(id), label: String(label) });
    return this;
  }

  addUrl(label: string, url: string): this {
    this.rows.push({ kind: "url", label: String(label), url: String(url) });
    return this;
  }

  addCopy(label: string, code: string): this {
    this.rows.push({ kind: "copy", label: String(label), code: String(code) });
    return this;
  }

  addCall(label: string, number: string | number): this {
    this.rows.push({ kind: "call", label: String(label), number: String(number) });
    return this;
  }

  addList(title: string, sections: BuilderRow["sections"]): this {
    this.rows.push({ kind: "list", label: title, title, sections });
    return this;
  }

  setButtonLimit(limit = 1, opts: { listTitle?: string; buttonTitle?: string; dividers?: number[] | "all" } = {}): this {
    this.overflowLimit = Math.max(1, Number(limit) || 1);
    this.overflowTitles = { list: opts.listTitle || "action list", button: opts.buttonTitle || "choose action" };
    const dividers = opts.dividers === "all" ? this.rows.map((_, i) => i + 1) : opts.dividers || [];
    this.overflowDividers = dividers;
    return this;
  }

  private toInputs(): Record<string, unknown>[] {
    return this.rows.map((r) => {
      if (r.kind === "url") return { url: r.url, text: r.label };
      if (r.kind === "copy") return { copy: r.code, text: r.label };
      if (r.kind === "call") return { call: r.number, text: r.label };
      if (r.kind === "list") return { title: r.title, sections: r.sections };
      return { id: r.id, text: r.label };
    });
  }

  build(platform: "whatsapp" | "telegram" | "discord"): unknown {
    const text = this.titleText ? `*${this.titleText}*\n${this.bodyText}` : this.bodyText;
    if (platform === "telegram") {
      const inline_keyboard = this.rows.map((r) => {
        if (r.kind === "url") return [{ text: r.label, url: r.url }];
        return [{ text: r.label, callback_data: r.id || r.label }];
      });
      return { text, reply_markup: { inline_keyboard } };
    }
    if (platform === "discord") {
      const components = [
        {
          type: 1,
          components: this.rows.slice(0, 5).map((r, i) => {
            if (r.kind === "url") return { type: 2, style: 5, label: r.label.slice(0, 80), url: r.url };
            return { type: 2, style: 1, label: r.label.slice(0, 80), custom_id: r.id || `btn_${i}` };
          })
        }
      ];
      return { content: text.slice(0, 2000), components };
    }
    return {
      text: this.bodyText,
      title: this.titleText,
      subtitle: this.subtitleText,
      footer: this.footerText,
      media: this.media,
      buttons: this.toInputs()
    };
  }

  async sendWhatsApp(sock: any, chat: string, quoted?: any): Promise<unknown> {
    const media = this.media ? { ...(this.media.image ? { image: this.media.image } : { video: this.media.video }), title: this.media.title || this.titleText } : null;
    const flow = this.overflowLimit
      ? {
          messageParamsJson: JSON.stringify({
            bottom_sheet: {
              in_thread_buttons_limit: this.overflowLimit,
              divider_indices: this.overflowDividers,
              list_title: this.overflowTitles.list,
              button_title: this.overflowTitles.button
            }
          })
        }
      : undefined;
    return sendWhatsAppButtons(sock, chat, this.bodyText, this.toInputs() as never[], this.footerText || undefined, quoted, media, flow);
  }

  async sendTelegram(ctx: any): Promise<unknown> {
    const payload = this.build("telegram") as { text: string; reply_markup: unknown };
    return ctx.reply(payload.text, { reply_markup: payload.reply_markup });
  }

  async sendDiscord(target: any): Promise<unknown> {
    const payload = this.build("discord") as { content: string; components: unknown[] };
    if (target && typeof target.reply === "function") {
      try {
        return await target.reply(payload);
      } catch {}
    }
    return target.send(payload);
  }
}

export function buttons(): Buttons {
  return new Buttons();
}

export { normInteractive };
