import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");
const wa = sdk.sdk.whatsapp;
const { serializeM } = require("../dist/cjs/lib/serialize.js");
const { Connection } = require("../dist/cjs/lib/connection.js");

const flowMsg = (name, params) => ({
  message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name, paramsJson: params } } }
});

describe("tap", () => {
  it("reads all response shapes", () => {
    assert.equal(wa.tap({ message: { buttonsResponseMessage: { selectedButtonId: "a" } } }), "a");
    assert.equal(wa.tap({ message: { templateButtonReplyMessage: { selectedId: "b" } } }), "b");
    assert.equal(wa.tap({ message: { listResponseMessage: { singleSelectReply: { selectedRowId: "c" } } } }), "c");
    assert.equal(wa.tap(flowMsg("quick_reply", '{"id":"d"}')), "d");
    assert.equal(wa.tap(flowMsg("quick_reply", '{"button_id":"e"}')), "e");
    assert.equal(wa.tap(flowMsg("single_select", '{"row_id":"f"}')), "f");
  });

  it("rejects cta names, bad json, label-only", () => {
    assert.equal(wa.tap(flowMsg("cta_url", '{"id":"x"}')), null);
    assert.equal(wa.tap(flowMsg("quick_reply", "not-json")), null);
    assert.equal(wa.tap(flowMsg("quick_reply", null)), null);
    assert.equal(wa.tap({ message: { interactiveResponseMessage: { body: { text: "Label" } } } }), null);
    assert.equal(wa.tap({ message: { conversation: "hi" } }), null);
  });

  it("unwraps ephemeral containers", () => {
    const inner = { interactiveResponseMessage: { nativeFlowResponseMessage: { name: "quick_reply", paramsJson: '{"id":"g"}' } } };
    assert.equal(wa.tap({ message: { ephemeralMessage: { message: inner } } }), "g");
    assert.equal(wa.tap({ message: { viewOnceMessageV2: { message: inner } } }), "g");
  });
});

describe("serialize tap mapping", () => {
  const sock = { decodeJid: (j) => j, user: { id: "bot@s.whatsapp.net" }, getName: () => "bot" };

  it("maps tap id to text", async () => {
    const m = await serializeM(sock, {
      key: { id: "ABC123", remoteJid: "1@s.whatsapp.net", fromMe: false },
      message: { interactiveResponseMessage: { nativeFlowResponseMessage: { name: "quick_reply", paramsJson: '{"id":".ping"}' } } }
    }, {});
    assert.equal(m.text, ".ping");
    assert.equal(m.tapId, ".ping");
  });
});

describe("anti-self guards", () => {
  const conn = new Connection({ plugins_dir: "./nope" });

  it("drops isBaileys + newsletter + status, keeps fromMe", () => {
    assert.equal(conn.isOwnNoise({ isBaileys: true }), true);
    assert.equal(conn.isOwnNoise({ chat: "x@newsletter" }), true);
    assert.equal(conn.isOwnNoise({ sender: "x@broadcast" }), true);
    assert.equal(conn.isOwnNoise({ chat: "status@broadcast" }), true);
    assert.equal(conn.isOwnNoise({ fromMe: true, chat: "1@s.whatsapp.net", sender: "me@s.whatsapp.net" }), false);
    assert.equal(conn.isOwnNoise({ chat: "1@s.whatsapp.net", sender: "2@s.whatsapp.net" }), false);
    assert.equal(conn.isOwnNoise(null), true);
  });
});
