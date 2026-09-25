import { randomUUID } from "node:crypto";

export function newLayout(name: string, data: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    view_model: {
      [Array.isArray(data) ? "primitives" : "primitive"]: data,
      __typename: `GenAI${name}LayoutViewModel`
    }
  };
}

export interface InlineEntity {
  key: string;
  metadata: Record<string, unknown>;
}

export interface EntityOptions {
  hyperlink?: boolean;
  citation?: boolean;
  latex?: boolean;
}

export function extractInlineEntities(text: string, opts: EntityOptions = {}): { text: string; inline_entities: InlineEntity[] } {
  const { hyperlink = true, citation = true, latex = true } = opts;
  const toEntity = (type: string, ie: any): InlineEntity | null => {
    if (type === "hyperlink") {
      return { key: ie.key, metadata: { display_name: ie.text, is_trusted: ie.url, url: ie.url, __typename: "GenAIInlineLinkItem" } };
    }
    if (type === "citation") {
      return {
        key: ie.key,
        metadata: {
          reference_id: ie.reference_id,
          reference_url: ie.url,
          reference_title: ie.url,
          reference_display_name: ie.url,
          sources: [],
          __typename: "GenAISearchCitationItem"
        }
      };
    }
    if (type === "latex") {
      return {
        key: ie.key,
        metadata: {
          latex_expression: ie.text,
          latex_image: { url: ie.url, width: Number(ie.width) || 100, height: Number(ie.height) || 100 },
          font_height: Number(ie.font_height) || 83.333333333333,
          padding: Number(ie.padding) || 15,
          __typename: "GenAILatexItem"
        }
      };
    }
    return null;
  };

  const inline_entities: InlineEntity[] = [];
  let result = "";
  let last = 0;
  let citationIndex = 1;
  let hyperlinkIndex = 0;
  let latexIndex = 0;
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[" && text[i - 1] !== "\\") {
      stack.push(i);
      continue;
    }
    if (text[i] === "]" && (text[i + 1] === "(" || text[i + 1] === "<")) {
      const start = stack.pop();
      if (start == null) continue;
      const open = text[i + 1];
      const close = open === "(" ? ")" : ">";
      const kind = open === "(" ? "link" : "latex";
      let end = i + 2;
      let depth = 1;
      while (end < text.length && depth) {
        if (text[end] === open && text[end - 1] !== "\\") depth++;
        else if (text[end] === close && text[end - 1] !== "\\") depth--;
        end++;
      }
      if (depth) continue;
      const raw = text.slice(start + 1, i).trim();
      const url = text.slice(i + 2, end - 1).trim();
      let key: string;
      let tag: string;
      let type: string;
      let ie: any;
      if (kind === "latex") {
        if (!latex) continue;
        const [txt = "", width = null, height = null, fontHeight = null, padding = null] = raw.split("|");
        key = `_LATEX_${latexIndex++}`;
        tag = `{{${key}}}${txt || "image"}{{/${key}}}`;
        type = "latex";
        ie = { key, text: txt, url, width, height, font_height: fontHeight, padding };
      } else if (raw) {
        if (!hyperlink) continue;
        const trusted = !url.startsWith("!");
        key = `_HYPERLINK_${hyperlinkIndex++}`;
        tag = `{{${key}}}${trusted ? url : url.slice(1)}{{/${key}}}`;
        type = "hyperlink";
        ie = { key, text: raw, url: trusted ? url : url.slice(1), is_trusted: trusted };
      } else {
        if (!citation) continue;
        key = `_CITATION_${citationIndex - 1}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        type = "citation";
        ie = { reference_id: citationIndex++, key, text: "", url };
      }
      result += text.slice(last, start) + tag;
      last = end;
      const entity = toEntity(type, ie);
      if (entity) inline_entities.push(entity);
      i = end - 1;
    }
  }
  result += text.slice(last);
  return { text: result, inline_entities };
}

export interface TableMeta {
  title: string;
  rows: { items: string[]; isHeading?: boolean }[];
  unifiedRows: { is_header?: boolean; cells: string[]; markdown_cells?: { text: string; inline_entities?: InlineEntity[] }[] }[];
}

export function toTableMetadata(rows: string[][], opts: EntityOptions = {}): TableMeta {
  if (!Array.isArray(rows) || !rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string"))) {
    throw new TypeError("Table must be a nested array of strings");
  }
  const [header, ...body] = rows;
  const maxLen = Math.max(header.length, ...body.map((r) => r.length));
  const normalize = (r: string[]) => [...r, ...Array(maxLen - r.length).fill("")];
  const unifiedRows = [{ is_header: true, cells: normalize(header) }, ...body.map((r) => ({ is_header: false, cells: normalize(r) }))].map((row) => {
    const markdownCells = row.cells.map((cell) => {
      const extracted = extractInlineEntities(cell, opts);
      return { text: extracted.text, ...(extracted.inline_entities.length ? { inline_entities: extracted.inline_entities } : {}) };
    });
    return { ...row, ...(markdownCells.some((c) => c.inline_entities?.length) ? { markdown_cells: markdownCells } : {}) };
  });
  return {
    title: "",
    rows: unifiedRows.map((r) => ({ items: r.cells, ...(r.is_header ? { isHeading: true } : {}) })),
    unifiedRows
  };
}

const KEYWORD_SETS: Record<string, Set<string>> = {
  javascript: new Set("break case catch continue debugger delete do else finally for function if in instanceof new return switch this throw typeof var void while with true false null undefined class const let super extends export import yield static async await get set".split(" ")),
  typescript: new Set("abstract any as asserts bigint boolean declare enum implements infer interface is keyof module namespace never readonly require number object override private protected public satisfies string symbol type unknown using from break case catch continue do else finally for function if new return switch this throw try var void while class const let extends import export async await".split(" ")),
  python: new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" ")),
  java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while".split(" ")),
  go: new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" ")),
  rust: new Set("as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(" ")),
  html: new Set("html head body div span p a img video audio script style link meta form input button table tr td th ul ol li section article header footer nav main".split(" ")),
  bash: new Set("if then else elif fi for while do done case esac function in select until break continue return export readonly local declare".split(" "))
};
KEYWORD_SETS.golang = KEYWORD_SETS.go;

export const HL = { DEFAULT: 0, KEYWORD: 1, METHOD: 2, STRING: 3, NUMBER: 4, COMMENT: 5 };
const HL_NAME = ["DEFAULT", "KEYWORD", "METHOD", "STR", "NUMBER", "COMMENT"];

export interface CodeToken {
  codeContent: string;
  highlightType: number;
}

export function tokenizeAIRichCode(code: string, lang = "javascript"): CodeToken[] {
  const key = (lang || "").toLowerCase();
  if (!key || key === "txt" || key === "text" || key === "plaintext") return [{ codeContent: code, highlightType: HL.DEFAULT }];
  const keywords = KEYWORD_SETS[key] || new Set<string>();
  const tokens: CodeToken[] = [];
  const push = (content: string, type: number) => {
    if (!content) return;
    const last = tokens[tokens.length - 1];
    if (last && last.highlightType === type) last.codeContent += content;
    else tokens.push({ codeContent: content, highlightType: type });
  };
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (/\s/.test(c)) {
      const s = i;
      while (i < code.length && /\s/.test(code[i])) i++;
      push(code.slice(s, i), HL.DEFAULT);
      continue;
    }
    if ((c === "/" && code[i + 1] === "/") || (c === "#" && (key === "python" || key === "bash"))) {
      const s = i;
      while (i < code.length && code[i] !== "\n") i++;
      push(code.slice(s, i), HL.COMMENT);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const s = i;
      const q = c;
      i++;
      while (i < code.length) {
        if (code[i] === "\\" && i + 1 < code.length) i += 2;
        else if (code[i] === q) {
          i++;
          break;
        } else i++;
      }
      push(code.slice(s, i), HL.STRING);
      continue;
    }
    if (/[0-9]/.test(c)) {
      const s = i;
      while (i < code.length && /[0-9._]/.test(code[i])) i++;
      push(code.slice(s, i), HL.NUMBER);
      continue;
    }
    if (/[a-zA-Z_$]/.test(c)) {
      const s = i;
      while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) i++;
      const word = code.slice(s, i);
      let type = HL.DEFAULT;
      if (keywords.has(word)) type = HL.KEYWORD;
      else {
        let j = i;
        while (j < code.length && /\s/.test(code[j])) j++;
        if (code[j] === "(") type = HL.METHOD;
      }
      push(word, type);
      continue;
    }
    push(c, HL.DEFAULT);
    i++;
  }
  return tokens;
}

function mediaUrl(value: unknown): string | undefined {
  if (Buffer.isBuffer(value)) return `data:application/octet-stream;base64,${value.toString("base64")}`;
  if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
    return (value as { url: string }).url;
  }
  return typeof value === "string" ? value : undefined;
}

export interface RichSubMessage {
  messageType: number;
  messageText?: string;
  inlineEntities?: InlineEntity[];
  codeMetadata?: { codeLanguage: string; codeBlocks: CodeToken[] };
  tableMetadata?: { title: string; rows: { items: string[]; isHeading?: boolean }[] };
  gridImageMetadata?: unknown;
  contentItemsMetadata?: unknown;
}

export class AIRichBuilder {
  private client: { sendMessage: (jid: string, content: unknown, options?: unknown) => Promise<unknown> } | null;
  private title = "";
  private footer = "";
  private contextInfo: Record<string, unknown> = {};
  private submessages: RichSubMessage[] = [];
  private sections: Record<string, unknown>[] = [];
  private richResponseSources: unknown[] = [];

  constructor(client?: { sendMessage: (jid: string, content: unknown, options?: unknown) => Promise<unknown> } | null) {
    this.client = client || null;
  }

  setTitle(title: string): this {
    if (typeof title !== "string") throw new TypeError("Title must be a string");
    this.title = title;
    return this;
  }

  setFooter(footer: string): this {
    if (typeof footer !== "string") throw new TypeError("Footer must be a string");
    this.footer = footer;
    return this;
  }

  setContextInfo(obj: Record<string, unknown>): this {
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) throw new TypeError("ContextInfo must be a plain object");
    this.contextInfo = obj;
    return this;
  }

  addText(text: string, opts: EntityOptions = {}): this {
    if (typeof text !== "string") throw new TypeError("Text must be a string");
    const { text: extractedText, inline_entities } = extractInlineEntities(text, opts);
    this.submessages.push({ messageType: 2, messageText: extractedText, inlineEntities: inline_entities });
    this.sections.push(newLayout("Single", { text: extractedText, ...(inline_entities.length ? { inline_entities } : {}), __typename: "GenAIMarkdownTextUXPrimitive" }));
    return this;
  }

  addCode(language: string, code: string): this {
    if (typeof language !== "string" || typeof code !== "string") throw new TypeError("Language and code must be a string");
    const tokens = tokenizeAIRichCode(code, language);
    this.submessages.push({ messageType: 5, codeMetadata: { codeLanguage: language, codeBlocks: tokens } });
    this.sections.push(
      newLayout("Single", {
        language,
        code_blocks: tokens.map((b) => ({ content: b.codeContent, type: HL_NAME[b.highlightType] })),
        __typename: "GenAICodeUXPrimitive"
      })
    );
    return this;
  }

  addTable(table: string[][], opts: EntityOptions = {}): this {
    if (!Array.isArray(table)) throw new TypeError("Table must be an array");
    const meta = toTableMetadata(table, opts);
    this.submessages.push({ messageType: 4, tableMetadata: { title: meta.title, rows: meta.rows } });
    this.sections.push(newLayout("Single", { rows: meta.unifiedRows, __typename: "GenATableUXPrimitive" }));
    return this;
  }

  addImage(image: string | Buffer | (string | Buffer)[]): this {
    const list = (Array.isArray(image) ? image : [image]).map(mediaUrl).filter(Boolean) as string[];
    this.submessages.push({
      messageType: 1,
      gridImageMetadata: { gridImageUrl: { imagePreviewUrl: list[0] }, imageUrls: list.map((u) => ({ imagePreviewUrl: u, imageHighResUrl: u, sourceUrl: u })) }
    });
    for (const url of list) {
      this.sections.push(newLayout("Single", { media: { url, mime_type: "image/png" }, imagine_type: "IMAGE", status: { status: "READY" }, __typename: "GenAIImaginePrimitive" }));
    }
    return this;
  }

  addSuggest(suggestion: string | string[], opts: { scroll?: boolean; layout?: string } = {}): this {
    if (!(typeof suggestion === "string" || (Array.isArray(suggestion) && suggestion.every((v) => typeof v === "string")))) {
      throw new TypeError("Suggestion must be a string or array of strings");
    }
    const { scroll = true, layout } = opts;
    const items = (Array.isArray(suggestion) ? suggestion : [suggestion]).map((text) => ({ prompt_text: text, prompt_type: "SUGGESTED_PROMPT", __typename: "GenAIFollowUpSuggestionPillPrimitive" }));
    const type = layout ?? (items.length === 1 ? "Single" : scroll ? "HScroll" : "ActionRow");
    this.sections.push(newLayout(type, type === "Single" ? items[0] : items, { __typename: "GenAIUnifiedResponseSection" }));
    return this;
  }

  addTip(text: string): this {
    this.submessages.push({ messageType: 2, messageText: text });
    this.sections.push(newLayout("Single", { text, __typename: "GenAIMetadataTextPrimitive" }));
    return this;
  }

  addProcess(title: string): this {
    if (typeof title !== "string") throw new TypeError("Process title must be a string");
    this.submessages.push({ messageType: 2, messageText: title });
    this.sections.push(
      newLayout("Single", { icon: null, is_in_progress: true, meta_search_apps: null, target_secondary_screen_id: null, target_secondary_screen_tab_id: null, title, __typename: "GenAIBotProgressStatusPrimitive" })
    );
    return this;
  }

  addSource(sources: string[] | string[][]): this {
    const isFlat = Array.isArray(sources) && sources.every((item) => typeof item === "string");
    const list = isFlat ? [sources as string[]] : (sources as string[][]);
    if (!(Array.isArray(list) && list.every((item) => Array.isArray(item) && item.every((v) => typeof v === "string")))) {
      throw new TypeError("Sources must be a string array or an array of string arrays");
    }
    const mapped = list.map(([icon, url, text]) => ({
      source_type: "THIRD_PARTY",
      source_display_name: text ?? "",
      source_subtitle: "AI",
      source_url: url ?? "",
      favicon: { url: icon ?? "", mime_type: "image/jpeg", width: 16, height: 16 }
    }));
    this.sections.push(newLayout("Single", { sources: mapped, __typename: "GenAISearchResultPrimitive" }));
    return this;
  }

  build(opts: { forwarded?: boolean; quoted?: any; quotedParticipant?: string; botJid?: string } = {}): Record<string, unknown> {
    const { forwarded = true, quoted, quotedParticipant, botJid = "0@bot" } = opts;
    const forward = forwarded
      ? { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid }, forwardOrigin: 4 }
      : {};
    const quotedObj = quoted
      ? {
          stanzaId: quoted?.key?.id || quoted?.id,
          participant: quotedParticipant || quoted?.key?.participant || quoted?.key?.remoteJid,
          quotedType: 0,
          quotedMessage: quoted?.message ?? quoted
        }
      : {};
    const sections = this.footer
      ? [...this.sections, newLayout("Single", { text: this.footer, __typename: "GenAIMetadataTextPrimitive" })]
      : this.sections;
    const responseData: Record<string, unknown> = { response_id: randomUUID(), sections };
    const richResponseMessage: Record<string, unknown> = {
      messageType: 1,
      submessages: this.submessages,
      contextInfo: { ...forward, ...quotedObj, ...this.contextInfo }
    };
    if (sections.length > 0) {
      richResponseMessage.unifiedResponse = { data: Buffer.from(JSON.stringify(responseData)).toString("base64") };
    }
    return {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: { messageDisclaimerText: this.title, richResponseSourcesMetadata: { sources: this.richResponseSources } }
      },
      botForwardedMessage: { message: { richResponseMessage } }
    };
  }

  async send(jid: string, opts: { forwarded?: boolean; quoted?: any; quotedParticipant?: string; botJid?: string } & Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) throw new Error("AIRichBuilder.send() needs a client");
    const { forwarded, quoted, quotedParticipant, botJid, ...sendOptions } = opts;
    const content = this.build({ forwarded, quoted, quotedParticipant, botJid });
    return this.client.sendMessage(jid, content, sendOptions);
  }
}

export interface AIRichSpec {
  title?: string;
  footer?: string;
  contextInfo?: Record<string, unknown>;
  text?: string;
  textOptions?: EntityOptions;
  code?: { language: string; code: string };
  table?: string[][];
  tableOptions?: EntityOptions;
  image?: string | Buffer | (string | Buffer)[];
  tip?: string;
  suggest?: string | string[];
  suggestOptions?: { scroll?: boolean; layout?: string };
  process?: string;
  source?: string[] | string[][];
}

export function aiRichBuilderFromSpec(spec: AIRichSpec): AIRichBuilder {
  const b = new AIRichBuilder();
  if (spec.title) b.setTitle(spec.title);
  if (spec.footer) b.setFooter(spec.footer);
  if (spec.contextInfo) b.setContextInfo(spec.contextInfo);
  if (spec.text) b.addText(spec.text, spec.textOptions);
  if (spec.code) b.addCode(spec.code.language, spec.code.code);
  if (spec.table) b.addTable(spec.table, spec.tableOptions);
  if (spec.image) b.addImage(spec.image);
  if (spec.tip) b.addTip(spec.tip);
  if (spec.suggest) b.addSuggest(spec.suggest, spec.suggestOptions);
  if (spec.process) b.addProcess(spec.process);
  if (spec.source) b.addSource(spec.source);
  return b;
}
