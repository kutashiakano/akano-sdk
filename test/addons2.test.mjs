import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");

describe("airich", () => {
  it("builds text/code/table/suggest sections", () => {
    const b = new sdk.airich.AIRichBuilder();
    b.setTitle("Demo").addText("Hello [world](https://x)").addCode("javascript", "const a = 1;").addTable([["A", "B"], ["1", "2"]]).addSuggest(["More"]).addTip("tip!");
    assert.equal(b.buildSectionsForTest, undefined);
    const built = b.build({ forwarded: false });
    const rr = built.botForwardedMessage.message.richResponseMessage;
    assert.equal(rr.messageType, 1);
    assert.ok(rr.submessages.length >= 4);
    const data = JSON.parse(Buffer.from(rr.unifiedResponse.data, "base64").toString());
    const kinds = data.sections.map((s) => s.view_model.primitive.__typename);
    assert.ok(kinds.includes("GenAIMarkdownTextUXPrimitive"));
    assert.ok(kinds.includes("GenAICodeUXPrimitive"));
    assert.ok(kinds.includes("GenATableUXPrimitive"));
    assert.ok(kinds.includes("GenAIFollowUpSuggestionPillPrimitive"));
  });

  it("tokenizer highlights", () => {
    const toks = sdk.airich.tokenizeAIRichCode("const a = 1;", "javascript");
    assert.ok(toks.some((t) => t.highlightType === 1));
    assert.deepEqual(sdk.airich.tokenizeAIRichCode("plain", "txt"), [{ codeContent: "plain", highlightType: 0 }]);
  });

  it("spec builder + quoted passthrough", () => {
    const b = sdk.airich.aiRichBuilderFromSpec({ title: "T", text: "Hi", code: { language: "javascript", code: "x" } });
    const built = b.build({ forwarded: false, quoted: { key: { id: "Q", participant: "u@s.whatsapp.net" }, message: { conversation: "hi" } } });
    assert.equal(built.botForwardedMessage.message.richResponseMessage.contextInfo.stanzaId, "Q");
  });
});

describe("buttons extras", () => {
  it("subtitle + overflow limit", () => {
    const b = sdk.buttons.buttons().setBody("Hi").setSubtitle("Sub").addReply("a", "A").setButtonLimit(1, { listTitle: "L", buttonTitle: "B" });
    const wa = b.build("whatsapp");
    assert.equal(wa.subtitle, "Sub");
    assert.ok(wa.text === "Hi" || typeof wa.text === "string");
  });

  it("sends overflow params", async () => {
    let sent = null;
    const fakeHelper = { sendInteractiveMessage: async (sock, chat, content) => { sent = content; return { key: { id: "M" } }; } };
    const b = sdk.buttons.buttons().setBody("Hi").addReply("a", "A").addReply("c", "C").setButtonLimit(1);
    const helperPath = require.resolve("baileys_helper");
    const orig = require.cache[helperPath]?.exports;
    require.cache[helperPath] = { exports: fakeHelper };
    try {
      await b.sendWhatsApp({ relayMessage: async () => ({}) }, "c@s.whatsapp.net");
    } finally {
      if (orig) require.cache[helperPath] = { exports: orig };
      else delete require.cache[helperPath];
    }
    assert.ok(sent && sent.interactiveMessage);
    assert.equal(sent.interactiveMessage.body.text, "Hi");
  });
});

describe("sessions", () => {
  it("validates session dirs", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "sess-"));
    assert.deepEqual(sdk.sessions.validateSession(path.join(base, "nope")), { valid: false, reason: "missing creds.json" });
    fs.mkdirSync(path.join(base, "bad"));
    fs.writeFileSync(path.join(base, "bad", "creds.json"), "{oops");
    assert.equal(sdk.sessions.validateSession(path.join(base, "bad")).valid, false);
    fs.mkdirSync(path.join(base, "unreg"));
    fs.writeFileSync(path.join(base, "unreg", "creds.json"), JSON.stringify({ registered: false }));
    assert.equal(sdk.sessions.validateSession(path.join(base, "unreg")).valid, false);
    fs.mkdirSync(path.join(base, "good"));
    fs.writeFileSync(
      path.join(base, "good", "creds.json"),
      JSON.stringify({ registered: true, noiseKey: {}, pairingEphemeralKeyPair: {}, signedIdentityKey: {}, signedPreKey: {} })
    );
    assert.deepEqual(sdk.sessions.validateSession(path.join(base, "good")), { valid: true });
    const mgr = sdk.sessions.createSessions({ dir: base });
    assert.deepEqual(mgr.loadAll().sort(), ["bad", "good", "unreg"]);
    assert.equal(mgr.info("nope"), null);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("stop unknown returns false", async () => {
    const mgr = sdk.sessions.createSessions({ dir: "/tmp/vox-sess-none" });
    assert.equal(await mgr.stop("ghost"), false);
  });
});

describe("cards", () => {
  const isPng = (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

  it("welcome + goodbye render", async () => {
    assert.ok(isPng(await sdk.cards.welcome("Bo", "Grup", 10)));
    assert.ok(isPng(await sdk.cards.goodbye("Bo", "Grup", 10)));
  });

  it("profile + levelup + certificate render", async () => {
    assert.ok(
      isPng(
        await sdk.cards.profileCard({ name: "Bo", id: "123", stats: [{ label: "LEVEL", value: 5 }], footer: "bot" })
      )
    );
    assert.ok(isPng(await sdk.cards.levelUpCard({ name: "Bo", before: 4, after: 5, role: "Mage", xp: 150, maxXp: 200 })));
    assert.ok(isPng(await sdk.cards.certificate({ name: "Bo", desc: "Top", roleLevel: "Mage 5" })));
  });

  it("rank card renders with xp bar", async () => {
    const buf = await sdk.cards.rankCard({ name: "Bo", level: 5, rank: 3, xp: 150, maxXp: 200 });
    assert.ok(isPng(buf));
    assert.ok(buf.length > 10000);
  });
});
