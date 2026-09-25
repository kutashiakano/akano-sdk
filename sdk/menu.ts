export interface MenuCommand {
  command: string;
  use: string;
}

export interface MenuPlugin {
  tags?: string | string[];
  category?: string | string[];
  names?: string | string[];
  help?: string | string[];
  command?: string | string[];
  name?: string | string[];
  description?: string;
  use?: string;
  filePath?: string;
  file?: string;
}

export interface MenuCollectOptions {
  hidden?: string[];
  hide?: string[];
  disabled?: string[];
  disable?: string[];
}

export interface MenuCategory {
  [tag: string]: MenuCommand[];
}

export interface MenuCollected {
  tags: string[];
  category: MenuCategory;
}

function normPlugin(pl: MenuPlugin, index: number): { tag: string; help: string[]; use: string; file: string } {
  const rawTag = pl.tags || pl.category || "misc";
  const tag = String(Array.isArray(rawTag) ? rawTag[0] : rawTag);
  let help: string[] = [];
  if (Array.isArray(pl.help)) help = pl.help.map(String);
  else if (typeof pl.help === "string") help = [pl.help];
  else if (Array.isArray(pl.command)) help = pl.command.map(String);
  else if (typeof pl.command === "string") help = [pl.command];
  else if (Array.isArray(pl.names)) help = pl.names.map(String);
  else if (typeof pl.names === "string") help = [pl.names];
  else if (Array.isArray(pl.name)) help = pl.name.map(String);
  else if (typeof pl.name === "string") help = [pl.name];
  else if (typeof pl.description === "string" && pl.description) help = [pl.description];
  return { tag, help: help.map(String), use: pl.use || "", file: pl.filePath || pl.file || `#${index}` };
}

export function collect(plugins: Iterable<MenuPlugin> | { values: () => Iterable<MenuPlugin> } | MenuPlugin[], opts: MenuCollectOptions = {}): MenuCollected {
  const hidden = new Set([...(opts.hidden || []), ...(opts.hide || [])]);
  const disabled = new Set([...(opts.disabled || []), ...(opts.disable || [])]);
  const list: MenuPlugin[] = Array.isArray(plugins) ? plugins : [...(typeof (plugins as { values?: () => Iterable<MenuPlugin> }).values === "function" ? (plugins as { values: () => Iterable<MenuPlugin> }).values() : (plugins as Iterable<MenuPlugin>))];
  const category: MenuCategory = {};
  list.forEach((pl, i) => {
    if (!pl) return;
    const n = normPlugin(pl, i);
    if (!n.tag || hidden.has(n.tag)) return;
    if (disabled.has(n.file)) return;
    if (!category[n.tag]) category[n.tag] = [];
    for (const command of n.help) category[n.tag].push({ command, use: n.use });
  });
  const tags = Object.keys(category).sort();
  for (const t of tags) category[t].sort((a, b) => a.command.localeCompare(b.command));
  return { tags, category };
}

export function box(items: MenuCommand[] | undefined, prefix: string): string {
  const list = items || [];
  return list
    .map((o, i) => {
      let b = "│";
      if (list.length === 1) b = "–";
      else if (i === 0) b = "┌";
      else if (i === list.length - 1) b = "└";
      return `${b}  ◦  ${prefix}${o.command}${o.use ? ` *${o.use}*` : ""}`;
    })
    .join("\n");
}

export interface MenuRenderOptions {
  prefix?: string;
  header?: string;
  footer?: string;
}

export function renderText(collected: MenuCollected, opts: MenuRenderOptions = {}): string {
  const prefix = opts.prefix || ".";
  let txt = (opts.header || "") + "\n\n";
  for (const tag of collected.tags) {
    txt += `乂  *${tag.toUpperCase().split("").join(" ")}*\n\n`;
    txt += box(collected.category[tag], prefix) + "\n\n";
  }
  txt += opts.footer || "";
  return txt;
}

export interface MenuSection {
  title: string;
  rows: { title: string; description: string; id: string }[];
}

export function renderSections(collected: MenuCollected, opts: MenuRenderOptions = {}): MenuSection[] {
  const prefix = opts.prefix || ".";
  return collected.tags.map((tag) => ({
    title: tag,
    rows: collected.category[tag].map((o) => ({
      title: o.command,
      description: o.use || `${collected.category[tag].length} commands`,
      id: prefix + o.command
    }))
  }));
}

export function fillTemplate(msg: unknown, vars?: Record<string, unknown>): string {
  let s = String(msg || "");
  for (const k of Object.keys(vars || {})) s = s.split("+" + k).join(String((vars as Record<string, unknown>)[k]));
  return s;
}

export interface PageOptions extends MenuRenderOptions {
  tag?: string;
  page?: number;
  perPage?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

export function paginate<T>(items: T[], page = 1, perPage = 8): Page<T> {
  const list = items || [];
  const size = Math.max(1, Number(perPage) || 8);
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (current - 1) * size;
  return { items: list.slice(start, start + size), page: current, totalPages, total: list.length };
}

export function pageId(tag: string, page: number, prefix = "."): string {
  return `${prefix}menu:page:${tag}:${page}`;
}

export function parsePageId(id: unknown): { tag: string; page: number } | null {
  const m = String(id || "").match(/^(.*)menu:page:(.+):(\d+)$/);
  if (!m) return null;
  return { tag: m[2], page: Number(m[3]) };
}

export interface PagedMenu {
  text: string;
  buttons: { id: string; text: string }[];
  page: number;
  totalPages: number;
}

export function renderPage(collected: MenuCollected, opts: PageOptions = {}): PagedMenu {
  const prefix = opts.prefix || ".";
  const tag = opts.tag || collected.tags[0] || "misc";
  const items = collected.category[tag] || [];
  const pager = paginate(items, opts.page, opts.perPage);
  let text = (opts.header || "") + "\n\n";
  text += `乂  *${tag.toUpperCase().split("").join(" ")} (${pager.page}/${pager.totalPages})*\n\n`;
  text += box(pager.items, prefix) + "\n\n";
  text += opts.footer || "";
  const buttons: { id: string; text: string }[] = [];
  if (pager.page > 1) buttons.push({ id: pageId(tag, pager.page - 1, prefix), text: "◀ Prev" });
  if (pager.page < pager.totalPages) buttons.push({ id: pageId(tag, pager.page + 1, prefix), text: "Next ▶" });
  return { text, buttons, page: pager.page, totalPages: pager.totalPages };
}

export function pageKeyboard(paged: PagedMenu): { inline_keyboard: { text: string; callback_data: string }[][] } {
  return {
    inline_keyboard: paged.buttons.map((b) => [{ text: b.text, callback_data: b.id }])
  };
}
