import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");

describe("antidelete", () => {
  it("tracks and resolves", () => {
    const store = new sdk.antidelete.AntiDeleteStore(2);
    store.track({ id: "a", chat: "c", sender: "s", text: "hi", mtype: "conversation", at: 1, raw: {} });
    store.track({ id: "b", chat: "c", sender: "s", text: "x", mtype: "conversation", at: 2, raw: {} });
    store.track({ id: "c", chat: "c", sender: "s", text: "y", mtype: "conversation", at: 3, raw: {} });
    assert.equal(store.resolve("a"), null);
    assert.equal(store.resolve("b").text, "x");
    assert.equal(store.size, 2);
    assert.equal(store.clear("c"), 2);
  });

  it("watches import + delete events", () => {
    const handlers = {};
    const conn = { on: (e, fn) => { handlers[e] = fn; } };
    let got = null;
    sdk.antidelete.watchAntiDelete(conn, (stored) => { got = stored; });
    handlers["import"]({ m: { key: { id: "k1" }, chat: "c", sender: "s", text: "secret", mtype: "conversation" } });
    handlers["message.delete"]({ id: "k1" });
    assert.equal(got.text, "secret");
    got = "kept";
    handlers["message.delete"]({ id: "unknown" });
    assert.equal(got, "kept");
  });

  it("discord watcher skips bots", () => {
    let n = 0;
    let captured = null;
    const client = { on: (e, fn) => { captured = fn; } };
    sdk.antidelete.watchAntiDeleteDiscord(client, () => { n++; });
    captured({ id: "1", channel: { id: "c" }, author: { id: "b", bot: true }, content: "x" });
    assert.equal(n, 0);
    captured({ id: "2", channel: { id: "c" }, author: { id: "u" }, content: "hi" });
    assert.equal(n, 1);
  });
});

describe("buttons builder", () => {
  it("chains and builds whatsapp payload", () => {
    const b = sdk.buttons
      .buttons()
      .setTitle("T")
      .setBody("Pick")
      .setFooter("F")
      .addReply("a", "A")
      .addUrl("Site", "https://x")
      .addCopy("Copy", "K")
      .addCall("Tel", "6281")
      .addList("Menu", [{ title: "M", rows: [{ id: "r1", title: "R1" }] }]);
    const wa = b.build("whatsapp");
    assert.equal(wa.text, "Pick");
    assert.equal(wa.title, "T");
    assert.equal(wa.buttons.length, 5);
  });

  it("builds telegram keyboard + discord row", () => {
    const b = sdk.buttons.buttons().setBody("Hi").addReply("a", "A").addUrl("S", "https://x");
    const tg = b.build("telegram");
    assert.deepEqual(tg.reply_markup.inline_keyboard[1], [{ text: "S", url: "https://x" }]);
    const dc = b.build("discord");
    assert.equal(dc.components[0].components.length, 2);
    assert.equal(dc.components[0].components[1].style, 5);
  });

  it("sends via platform targets", async () => {
    const b = sdk.buttons.buttons().setBody("Hi").addReply("a", "A");
    let tgSent = null;
    await b.sendTelegram({ reply: async (t, ex) => { tgSent = [t, ex]; } });
    assert.equal(tgSent[0], "Hi");
    let dcSent = null;
    await b.sendDiscord({ send: async (p) => { dcSent = p; } });
    assert.ok(dcSent.content.includes("Hi"));
  });
});

describe("ads", () => {
  it("builds externalAdReply", () => {
    const ad = sdk.sdk.whatsapp.adReply({ title: "T", body: "B", url: "https://x" });
    assert.equal(ad.title, "T");
    assert.equal(ad.showAdAttribution, true);
  });

  it("sends ad text", async () => {
    let sent = null;
    const sock = { sendMessage: async (jid, c) => { sent = c; return {}; } };
    await sdk.sdk.whatsapp.sendAd(sock, "c", "Hello", { title: "T" });
    assert.equal(sent.text, "Hello");
    assert.equal(sent.contextInfo.externalAdReply.title, "T");
  });
});

describe("wizard", () => {
  const make = () => new sdk.wizard.Wizard([
    { prompt: "Name?", key: "name" },
    { prompt: "Age?", key: "age", parse: (t) => (/^\d+$/.test(t) ? { ok: true, value: Number(t) } : { ok: false, error: "Numbers only" }) }
  ]);

  it("walks steps with validation", () => {
    const w = make();
    assert.deepEqual(w.start(), { done: false, text: "Name?" });
    assert.deepEqual(w.next("Bo"), { done: false, text: "Age?" });
    assert.deepEqual(w.next("xx"), { done: false, text: "Numbers only" });
    assert.deepEqual(w.next("20"), { done: true, data: { name: "Bo", age: 20 } });
  });

  it("runner routes by key", async () => {
    const sent = [];
    const done = [];
    const r = new sdk.wizard.WizardRunner(make, {
      send: async (k, t) => { sent.push([k, t]); },
      onDone: async (k, d) => { done.push([k, d]); }
    });
    await r.start("u1");
    assert.deepEqual(sent, [["u1", "Name?"]]);
    await r.handle("u1", "Bo");
    await r.handle("u1", "20");
    assert.equal(r.active("u1"), false);
    assert.deepEqual(done, [["u1", { name: "Bo", age: 20 }]]);
    assert.equal(await r.handle("nobody", "hi"), false);
    await r.start("u2");
    assert.equal(r.cancel("u2"), true);
  });
});

describe("session", () => {
  it("auto-creates with defaults + persists", async () => {
    const saved = {};
    const s = sdk.session.createSession({
      defaults: { xp: 0 },
      save: async (id, d) => { saved[id] = d; }
    });
    assert.deepEqual(await s.get("u1"), { xp: 0 });
    await s.set("u1", { xp: 5 });
    assert.deepEqual(saved.u1, { xp: 5 });
    const sess = await s.session("u1");
    assert.equal(sess.data.xp, 5);
    assert.equal(await s.clear("u1"), true);
  });
});

describe("paged menu", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ command: "c" + i, use: "" }));

  it("paginates and renders nav", () => {
    const p = sdk.menu.paginate(items, 2, 4);
    assert.deepEqual([p.page, p.totalPages, p.items.length], [2, 3, 4]);
    const collected = { tags: ["t"], category: { t: items } };
    const page = sdk.menu.renderPage(collected, { prefix: ".", tag: "t", page: 1, perPage: 4, header: "H" });
    assert.equal(page.buttons.length, 1);
    assert.equal(page.buttons[0].text, "Next ▶");
    const id = sdk.menu.pageId("t", 2, ".");
    assert.deepEqual(sdk.menu.parsePageId(id), { tag: "t", page: 2 });
    assert.equal(sdk.menu.parsePageId("nope"), null);
    const kb = sdk.menu.pageKeyboard(page);
    assert.equal(kb.inline_keyboard[0][0].callback_data, page.buttons[0].id);
  });
});
