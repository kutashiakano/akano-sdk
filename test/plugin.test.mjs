import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");

describe("define", () => {
  const plugin = sdk.define({ name: ["ping", "p"], description: "Check latency", tags: "info", cooldown: 3, run: async () => {} });

  it("keeps full names on every platform", () => {
    assert.deepEqual(plugin.telegram.command, ["ping", "p"]);
    assert.deepEqual(plugin.telegram.names, ["ping", "p"]);
    assert.deepEqual(plugin.discord.command, ["ping", "p"]);
    assert.deepEqual(plugin.whatsapp.command, ["ping", "p"]);
  });

  it("passes tags through", () => {
    assert.equal(plugin.telegram.tags, "info");
    assert.equal(plugin.discord.tags, "info");
    assert.equal(plugin.tags, "info");
  });

  it("telegram strips slash prefix only", async () => {
    let got = null;
    const p2 = sdk.define({ name: "hi", run: async (ctx) => { got = ctx; } });
    await p2.telegram.run({ message: { text: "/hi there" }, from: { id: 1 }, reply: async () => {} });
    assert.equal(got.text, "there");
    got = null;
    await p2.telegram.run({ message: { text: "hi there" }, from: { id: 1 }, reply: async () => {} });
    assert.equal(got.text, "hi there");
  });

  it("discord dig keeps group order and named args", async () => {
    let got = null;
    const p3 = sdk.define({ name: "cmd", run: async (ctx) => { got = ctx; } });
    await p3.discord.run({
      options: { data: [{ type: 2, name: "group", options: [{ type: 1, name: "sub", options: [{ name: "q", value: "x" }] }] }] },
      user: { id: "1" },
      reply: async () => {}
    });
    assert.equal(got.text, "group sub x");
    assert.deepEqual(got.named, { q: "x" });
  });

  it("cooldowns per user", async () => {
    let n = 0;
    const p4 = sdk.define({ name: "c", cooldown: 60, run: async () => { n++; } });
    const ctx = (id) => ({ message: { text: "/c" }, from: { id }, reply: async () => {} });
    await p4.telegram.run(ctx("u1"));
    await p4.telegram.run(ctx("u1"));
    assert.equal(n, 1);
  });
});

describe("menu with define plugins", () => {
  it("buckets by tags not misc", () => {
    const plugin = sdk.define({ name: "ping", tags: "info", run: async () => {} });
    const c = sdk.menu.collect([plugin]);
    assert.deepEqual(c.tags, ["info"]);
  });
});
