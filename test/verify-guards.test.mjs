import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");

function fakeSock() {
  const sent = [];
  return {
    sent,
    decodeJid: (j) => j,
    sendMessage: async (jid, c) => {
      sent.push([jid, c]);
      return { key: { id: "MSG1" } };
    },
    reply: async (chat, t) => {
      sent.push(["reply:" + chat, t]);
    },
    groupRequestParticipantsUpdate: async () => [{ status: "200" }]
  };
}

describe("verify", () => {
  it("captcha roundtrip with attempts", async () => {
    const v = sdk.verify.createVerifier({ config: { expiresIn: 60000, maxAttempts: 2 } });
    const sock = fakeSock();
    await v.onJoinRequest(sock, { id: "g@g.us", participant: "u@s.whatsapp.net", action: "created" });
    const key = Object.keys(v.state)[0];
    assert.ok(key, "state created");
    const code = v.state[key].captcha;
    const base = { fromMe: false, sender: "u@s.whatsapp.net", chat: "u@s.whatsapp.net" };
    await v.handleReply(sock, { ...base, quoted: { id: "NOPE" }, text: code });
    assert.equal(Object.keys(v.state).length, 1, "wrong message id ignored");
    await v.handleReply(sock, { ...base, quoted: { id: "MSG1" }, text: "XXXX" });
    assert.equal(v.state[key].attempts, 1);
    await v.handleReply(sock, { ...base, quoted: { id: "MSG1" }, text: code });
    assert.equal(Object.keys(v.state).length, 0, "approved and cleared");
  });

  it("revoked requests clear state", async () => {
    const v = sdk.verify.createVerifier({});
    const sock = fakeSock();
    await v.onJoinRequest(sock, { id: "g@g.us", participant: "u@s.whatsapp.net", action: "created" });
    assert.equal(Object.keys(v.state).length, 1);
    await v.onJoinRequest(sock, { id: "g@g.us", participant: "u@s.whatsapp.net", action: "revoked" });
    assert.equal(Object.keys(v.state).length, 0);
  });
});

describe("guards", () => {
  const common = sdk.sdk.common;
  it("permission levels", () => {
    assert.equal(common.permission.getPermission("1@s.whatsapp.net", { owners: ["1"] }), "owner");
    assert.equal(common.permission.getPermission("2@s.whatsapp.net", { premium: ["2"] }), "premium");
    assert.equal(common.permission.getPermission("3@s.whatsapp.net", {}), "user");
  });

  it("cooldown + spam", () => {
    const cd = new common.cooldown.Cooldown(50);
    cd.set("u", "ping");
    assert.ok(cd.has("u", "ping"));
    const spam = new common.cooldown.SpamDetection({ NOT_T: 2, HOLD_THRESHOLD: 99, PERM_T: 99, BAN_T: 99 });
    spam.detection("u");
    assert.equal(spam.detection("u").state, "NOTIFY");
  });

  it("anti links", () => {
    assert.ok(common.anti.isLink("join https://chat.whatsapp.com/abc"));
    assert.ok(!common.anti.isLink("hello world"));
  });
});
