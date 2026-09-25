import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");
const wa = sdk.sdk.whatsapp;

describe("sendMetaMsg", () => {
  it("builds text/code/table sections", async () => {
    let sent = null;
    const sock = { relayMessage: async (chat, msg) => { sent = msg; return {}; } };
    await wa.sendMetaMsg(sock, "c@s.whatsapp.net", [
      { text: "Hello" },
      { code: "console.log(1)", language: "javascript" },
      { table: { title: "T", headers: ["A", "B"], rows: [["1", "2"]] } }
    ], { title: "Demo", footer: "FT" });
    const rr = sent.botForwardedMessage.message.richResponseMessage;
    const data = JSON.parse(Buffer.from(rr.unifiedResponse.data, "base64").toString());
    const kinds = data.sections.map((s) => s.view_model.primitive.__typename);
    assert.ok(kinds.includes("GenAIMarkdownTextUXPrimitive"));
    assert.ok(kinds.includes("GenAICodeUXPrimitive"));
    assert.ok(kinds.includes("GenATableUXPrimitive"));
    assert.equal(rr.contextInfo.isForwarded, true);
  });

  it("rejects empty blocks", async () => {
    const sock = { relayMessage: async () => ({}) };
    await assert.rejects(wa.sendMetaMsg(sock, "c", []), /at least 1 block/);
  });
});

describe("carousel", () => {
  it("requires media header per card", async () => {
    const sock = { relayMessage: async () => ({}) };
    await assert.rejects(
      wa.carousel(sock, "c@s.whatsapp.net", [{ title: "Card 1", body: "B1", buttons: [] }]),
      /needs an image or video header/
    );
  });

  it("builds slides with biz nodes", async () => {
    let sent = null;
    let nodes = null;
    const sock = {
      waUploadToServer: async () => {
        throw new Error("no upload in unit test");
      },
      relayMessage: async (chat, msg, opts) => {
        sent = msg;
        nodes = opts.additionalNodes;
        return {};
      }
    };
    await assert.rejects(
      wa.carousel(sock, "c@s.whatsapp.net", [
        { image: "https://x/a.jpg", title: "Card 1", body: "B1", footer: "F1", buttons: [{ id: "a", text: "A" }] }
      ])
    );
    assert.equal(sent, null);
    assert.equal(nodes, null);
  });

  it("maps button builders for slides", async () => {
    assert.deepEqual(wa.normInteractive(["a", "A"]), { name: "quick_reply", buttonParamsJson: '{"display_text":"A","id":"a"}' });
    assert.deepEqual(wa.normInteractive(wa.url("https://x", "Open")), { name: "cta_url", buttonParamsJson: '{"display_text":"Open","url":"https://x"}' });
    const single = wa.normInteractive(wa.section("Menu", [["nasi", "Nasi"]]));
    assert.equal(single.name, "single_select");
    assert.ok(single.buttonParamsJson.includes("nasi"));
  });

  it("rejects empty cards", async () => {
    const sock = { relayMessage: async () => ({}) };
    await assert.rejects(wa.carousel(sock, "c", []), /at least 1 card/);
  });
});

describe("auth", () => {
  const name = "test-auth-" + Date.now();
  after(() => {
    try {
      fs.unlinkSync("./data/" + name + ".json");
    } catch {}
  });

  it("roundtrips creds + keys", async () => {
    const a1 = await sdk.auth.createAuthState(null, name);
    assert.ok(a1.state.creds);
    const buf = Buffer.from([1, 2, 3]);
    await a1.state.keys.set({ test: { k1: buf } });
    const got = await a1.state.keys.get("test", ["k1"]);
    assert.ok(Buffer.isBuffer(got.k1));
    assert.deepEqual([...got.k1], [1, 2, 3]);
    await a1.saveCreds();
    const a2 = await sdk.auth.createAuthState(null, name);
    const got2 = await a2.state.keys.get("test", ["k1"]);
    assert.ok(Buffer.isBuffer(got2.k1));
  });

  it("authUrl helper", () => {
    assert.equal(sdk.auth.authUrl("sqlite", "./a.db"), "sqlite://./a.db");
    assert.equal(sdk.auth.authUrl("json", ""), "");
  });
});
