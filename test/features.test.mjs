import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");
const wa = sdk.sdk.whatsapp;

function fakeSock() {
  const calls = [];
  return {
    calls,
    sendMessage: async (jid, content) => {
      calls.push(["send", jid, content]);
      return { key: { id: "M1" } };
    },
    sendPresenceUpdate: async (state, jid) => {
      calls.push(["presence", state, jid]);
    },
    groupParticipantsUpdate: async (chat, users, action) => {
      calls.push(["group", chat, users, action]);
      return true;
    },
    ev: { handlers: {}, on(ev, fn) { this.handlers[ev] = fn; } }
  };
}

describe("group admin", () => {
  it("validates users", async () => {
    const sock = fakeSock();
    await assert.rejects(wa.groupAdmin(sock, "g@g.us", "promote", []), /at least 1 user/);
    await wa.groupAdmin(sock, "g@g.us", "promote", "1@s.whatsapp.net");
    assert.deepEqual(sock.calls[0], ["group", "g@g.us", ["1@s.whatsapp.net"], "promote"]);
  });
});

describe("broadcast", () => {
  it("collects per-jid results", async () => {
    const sock = fakeSock();
    const out = await wa.broadcast(sock, ["a@s.whatsapp.net", "b@s.whatsapp.net"], (jid) => ({ text: "hi " + jid }), 0);
    assert.equal(out.length, 2);
    assert.ok(out.every((r) => r.ok));
  });

  it("reports failures", async () => {
    const sock = fakeSock();
    sock.sendMessage = async () => { throw new Error("nope"); };
    const out = await wa.broadcast(sock, ["a@s.whatsapp.net"], { text: "hi" }, 0);
    assert.equal(out[0].ok, false);
  });
});

describe("typing", () => {
  it("sends scoped presence and pauses", async () => {
    const sock = fakeSock();
    await wa.typing(sock, "c@s.whatsapp.net", "composing", 5);
    assert.deepEqual(sock.calls[0], ["presence", "composing", "c@s.whatsapp.net"]);
    assert.deepEqual(sock.calls[1], ["presence", "paused", "c@s.whatsapp.net"]);
  });
});

describe("leveling", () => {
  it("curve and stats", () => {
    assert.equal(sdk.Function.xpForLevel(0), 0);
    assert.equal(sdk.Function.xpForLevel(1), 100);
    const s = sdk.Function.levelStats(150);
    assert.equal(s.level, 1);
    assert.equal(s.curXp, 50);
    assert.equal(s.nextXp, 200);
    assert.ok(s.progress > 0 && s.progress < 1);
    assert.ok(s.role.name.length > 0);
  });
});

describe("i18n", () => {
  it("lookup, fallback, interpolation", () => {
    assert.equal(sdk.i18n.t("en", "cooldown", { s: 5 }), "Slow down, wait 5s.");
    assert.match(sdk.i18n.t("id", "cooldown", { s: 5 }), /tunggu 5/);
    assert.equal(sdk.i18n.t("xx", "cooldown", { s: 1 }), "Slow down, wait 1s.");
    assert.equal(sdk.i18n.t("en", "missing-key"), "missing-key");
    sdk.i18n.addStrings("en", { hello: "Hi {name}" });
    assert.equal(sdk.i18n.t("en", "hello", { name: "A" }), "Hi A");
  });
});

describe("scheduler", () => {
  it("validates and tracks jobs", () => {
    assert.throws(() => sdk.scheduler.schedule("bad", "not-a-cron", () => {}), /Invalid cron/);
    sdk.scheduler.schedule("t1", "* * * * * *", () => {});
    assert.ok(sdk.scheduler.list().includes("t1"));
    assert.equal(sdk.scheduler.stop("t1"), true);
    assert.equal(sdk.scheduler.stop("t1"), false);
    sdk.scheduler.stopAll();
  });
});

describe("poll watcher", () => {
  it("routes poll updates to fn", async () => {
    const sock = fakeSock();
    let got = null;
    wa.watchPoll(sock, async () => ({ pollCreationMessage: { name: "Q", options: [] } }), (key, tally, updates) => { got = key; });
    assert.ok(typeof sock.ev.handlers["messages.update"] === "function");
  });
});
