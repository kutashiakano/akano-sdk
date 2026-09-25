import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");
const wa = sdk.sdk.whatsapp;
const { serializeM } = require("../dist/cjs/lib/serialize.js");

describe("forwardInfo", () => {
  it("reads serialized flags", () => {
    assert.deepEqual(wa.forwardInfo({ isForwarded: true, forwardScore: 3 }), { forwarded: true, score: 3 });
    assert.deepEqual(wa.forwardInfo({ isForwarded: false, forwardScore: 0 }), { forwarded: false, score: 0 });
  });

  it("reads raw contextInfo", () => {
    assert.deepEqual(
      wa.forwardInfo({ message: { extendedTextMessage: { text: "x", contextInfo: { isForwarded: true, forwardingScore: 5 } } } }),
      { forwarded: true, score: 5 }
    );
    assert.deepEqual(wa.forwardInfo({ message: { conversation: "hi" } }), { forwarded: false, score: 0 });
    assert.deepEqual(wa.forwardInfo(null), { forwarded: false, score: 0 });
  });
});

describe("serialize forwarded flags", () => {
  const sock = { decodeJid: (j) => j, user: { id: "bot@s.whatsapp.net" }, getName: () => "bot" };

  it("sets isForwarded + forwardScore", async () => {
    const m = await serializeM(sock, {
      key: { id: "F1", remoteJid: "1@s.whatsapp.net", fromMe: false },
      message: { extendedTextMessage: { text: "fw", contextInfo: { isForwarded: true, forwardingScore: 2 } } }
    }, {});
    assert.equal(m.isForwarded, true);
    assert.equal(m.forwardScore, 2);
    const plain = await serializeM(sock, {
      key: { id: "F2", remoteJid: "1@s.whatsapp.net", fromMe: false },
      message: { conversation: "hi" }
    }, {});
    assert.equal(plain.isForwarded, false);
    assert.equal(plain.forwardScore, 0);
  });
});
