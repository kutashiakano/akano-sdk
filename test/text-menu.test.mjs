import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sdk = require("../dist/cjs/index.js");

describe("text", () => {
  it("formats per platform with short aliases", () => {
    assert.equal(sdk.Function.B("Hi", "telegram"), "<b>Hi</b>");
    assert.equal(sdk.Function.B("Hi", "tg"), "<b>Hi</b>");
    assert.equal(sdk.Function.B("Hi", "whatsapp"), "*Hi*");
    assert.equal(sdk.Function.B("Hi", "wa"), "*Hi*");
    assert.equal(sdk.Function.B("Hi", "discord"), "**Hi**");
    assert.equal(sdk.Function.B("Hi", "dc"), "**Hi**");
  });

  it("link shapes", () => {
    assert.equal(sdk.Function.Link("D", "https://x", "telegram"), '<a href="https://x">D</a>');
    assert.equal(sdk.Function.Link("D", "https://x", "discord"), "[D](https://x)");
  });
});

describe("menu", () => {
  const plugins = new Map([
    ["ping.js", { filePath: "ping.js", tags: "info", help: ["ping", "p"] }],
    ["menu.js", { filePath: "menu.js", tags: "main", help: ["menu"] }]
  ]);

  it("collects, sorts, hides", () => {
    const c = sdk.menu.collect(plugins, { hidden: ["main"] });
    assert.deepEqual(c.tags, ["info"]);
    assert.deepEqual(c.category.info.map((x) => x.command), ["p", "ping"]);
  });

  it("renders box text", () => {
    const c = sdk.menu.collect(plugins);
    const txt = sdk.menu.renderText(c, { prefix: ".", header: "H", footer: "F" });
    assert.match(txt, /D O W N L O A D E R|I N F O/);
    assert.match(txt, /\.ping/);
  });

  it("fills templates", () => {
    assert.equal(sdk.menu.fillTemplate("Hi +tag!", { tag: "@x" }), "Hi @x!");
  });
});

describe("core", () => {
  it("role table", () => {
    assert.deepEqual(sdk.Function.role(0), { name: "Warrior V", level: 0 });
    assert.deepEqual(sdk.Function.role(100), { name: "Cleric V", level: 100 });
    assert.deepEqual(sdk.Function.role("nope"), { name: "", level: "" });
  });

  it("similarity + greeting", () => {
    assert.equal(sdk.Function.similarity("ping", "ping"), 1);
    assert.ok(sdk.Function.similarity("ping", "pong") < 0.5);
    assert.equal(sdk.Function.greeting(9, "en"), "Good Morning");
  });
});
