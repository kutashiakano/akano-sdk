<div align="center">

# 🤖 @kutashiakanocanzy/sdk

**One SDK for WhatsApp · Telegram · Discord bots — in TypeScript.**

*CJS + ESM + `.d.ts`. Connection, session, plugins, serialize & media convert handled — you just write commands.*

| | Platform | Engine | Login |
|---|---|---|---|
| 💚 | **WhatsApp** | [Baileys](https://github.com/WhiskeySockets/Baileys) | QR 1x / pairing code |
| 💙 | **Telegram** | [grammy](https://grammy.dev) | [@BotFather](https://t.me/BotFather) token |
| 💜 | **Discord** | [discord.js](https://discord.js.org) | Developer Portal token |

</div>

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
- [WhatsApp](#whatsapp)
- [Telegram](#telegram)
- [Discord](#discord)
- [Plugins](#plugins)
- [Runtime](#runtime)
- [Database Auth and Sessions](#database-auth-and-sessions)
- [Tools](#tools)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [TypeScript](#typescript)

## Requirements

| Need | Detail |
|---|---|
| Node.js | `>= 20` |
| Media | `ffmpeg` + `ffprobe` in PATH (sticker, PTT, video, voice) |
| WhatsApp | 1x QR scan (or pairing code), session auto-persist |
| Telegram | Token from [@BotFather](https://t.me/BotFather), needs `grammy` |
| Discord | Token from [Developer Portal](https://discord.com/developers), needs `discord.js`, intent `Guilds` minimum |
| Optional DB | `better-sqlite3`, `ioredis`, `mysql2`, or `pg` (peer deps, install only what you use) |

## Install

```bash
npm install @kutashiakanocanzy/sdk
# pin beta live:
npm install @kutashiakanocanzy/sdk@0.2.2-beta.9
# optional peer deps — install only what you use:
npm install better-sqlite3   # sqlite://
# npm install ioredis        # redis://
# npm install mysql2         # mysql://
# npm install pg             # postgres://
```

Build output is `dist/cjs` (require) + `dist/esm` (import) + `.d.ts`, built via `prepare` (`npm run build`).

```javascript
// CommonJS
const { Platform, Database, Function, DiscordVoice, callFor, define, menu, verify } = require('@kutashiakanocanzy/sdk')
```

```typescript
// ESM + types (setara, pilih salah satu)
import { Platform, Database, Function, DiscordVoice, callFor, define, menu, verify } from '@kutashiakanocanzy/sdk'
import type { PlatformOptions, ButtonInput, HtmlOptions } from '@kutashiakanocanzy/sdk'
```

## Quick Start

### WhatsApp bot

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')
// ESM setara: import { Platform } from '@kutashiakanocanzy/sdk'

const wa = new Platform({
  platform: 'whatsapp',
  plugins_dir: './plugins',
  session_dir: './session',
  online: true,
  presence: true
})

wa.on('ready', x => console.log(x.message))
wa.on('connect', x => console.log(x.message))
wa.on('error', x => console.error(x.message))

wa.start()
```

First login: scan the QR in terminal. Restart = auto connect. Delete `session_dir` to switch account.

Pairing code instead of QR:

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')

const wa = new Platform({
  platform: 'whatsapp',
  plugins_dir: './plugins',
  session_dir: './session',
  pairing: { state: true, number: '6281234567890' }
})

wa.start()
```

### Telegram bot

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')

const api = new Platform({
  platform: 'telegram',
  plugins_dir: './plugins',
  telegram_token: '123456:ABCDEF'
})

await api.startTelegram()
```

### Discord bot

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')

const api = new Platform({
  platform: 'discord',
  plugins_dir: './plugins',
  discord_token: 'YOUR_DISCORD_TOKEN'
})

await api.startDiscord()
```

### All platforms at once

```javascript
const { runtime } = require('@kutashiakanocanzy/sdk')

const bot = runtime.createRuntime({
  platforms: 'whatsapp,telegram,discord',
  whatsapp: { plugins_dir: './plugins', session_dir: './session' },
  telegramToken: '123456:ABCDEF',
  discordToken: 'YOUR_DISCORD_TOKEN'
})

await bot.start()
```

## Concepts

### Platform

`Platform` is the single entry point. One class drives WhatsApp, Telegram, and Discord. You pick the platform with `platform: 'whatsapp' | 'telegram' | 'discord' | 'all'`, then call `start()`, `startWhatsapp()`, `startTelegram()`, or `startDiscord()`.

Every submodule also hangs off `Platform` as a static helper (`Platform.whatsapp`, `Platform.telegram`, `Platform.discord`, `Platform.menu`, and so on), so you never import deep paths in normal code.

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')

const wa = Platform.whatsapp // static helper, same object used inside Connection
console.log(typeof wa.reply, typeof wa.buttons, typeof wa.carousel)
```

### Plugin

One file in `plugins_dir` = one command. Files are plain CJS (`module.exports`), hot-reloaded with chokidar on WhatsApp. Each file can export a WhatsApp handler plus optional `.telegram` and `.discord` handlers, or be built with `define()` for a unified shape.

```javascript
// plugins/ping.js
module.exports = {
  name: 'ping',
  command: ['ping', 'p'],
  description: 'Check latency',
  run: async (m, { conn }) => {
    const t0 = Date.now()
    await m.reply('Pong! ' + (Date.now() - t0) + 'ms')
  }
}
```

### Context

Each platform gives you a different context object, but the idea is the same: who sent it, what they said, and how to reply.

| Platform | Context | Who | Text | Reply |
|---|---|---|---|---|
| WhatsApp | serialized `m` | `m.sender`, `m.chat` | `m.text`, `m.args`, `m.command` | `m.reply()`, `m.react()` |
| Telegram | grammy `ctx` (+ `readMsg`) | `chatId`, `userId`, `username` | `text` | `ctx.reply()`, helpers |
| Discord | message / interaction (+ `readMsg`) | `userId`, `guildId` | `text` | `reply()`, `editReply()`, `followUp()` |
| Unified | `define()` ctx | `ctx.user` | `ctx.text`, `ctx.args`, `ctx.named` | `ctx.reply()` |

## WhatsApp

Single entry point — no separate `Connection` import. The started client is `wa.client` (also returned by `start()`).

### Options

Shared by all platforms (`PlatformOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `platform` | string | `'whatsapp'` | `whatsapp`, `telegram`, `discord`, or `all` |
| `plugins_dir` | string | `'plugins'` | command folder |
| `session_dir` | string | `'./session'` | auth folder |
| `prefix` | string | `'.'` | command prefix |
| `online` | boolean | `false` | always-online |
| `presence` | boolean / object | `false` | auto presence update |
| `pairing` | object | off | `{ state, number, code }` pairing-code login |
| `token` | string | `''` | shorthand copied to `telegram_token` and `discord_token` |
| `telegram_token` | string | `''` | BotFather token |
| `discord_token` | string | `''` | Developer Portal token |
| `discord_guild_id` | string / array | none | instant slash-command register for these guilds |
| `extra` | object | `{}` | passed through (`botOptions`, `clientOptions`) |

WhatsApp-only (`ConnectionOptions` extra):

| Option | Type | Default | Description |
|---|---|---|---|
| `browser` | array | Chrome on macOS | WA client identity |
| `version` | array | latest | WA Web version override |
| `syncFullHistory` | boolean | `false` | sync full chat history |
| `bot` | function / null | `null` | custom bot-JID detector `(id) => bool` |
| `reconnectBaseMs` | number | `1000` | reconnect backoff base, exponential + jitter |

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')

const wa = new Platform({
  platform: 'whatsapp',
  plugins_dir: './bot/plugins',
  session_dir: './session',
  online: false,
  presence: false,
  prefix: '.',
  browser: ['Ubuntu', 'Chrome', '1.0'],
  syncFullHistory: false,
  reconnectBaseMs: 1000
})

wa.start()
```

### Events

| Event | When | Payload |
|---|---|---|
| `prepare` | QR shown, pairing code, or session ready | `{ display, message }` |
| `connect` | connected | `{ display, message }` |
| `reconnecting` | connection closed, retrying | `{ display, message }` |
| `error` | any error | `{ message }` |
| `import` | every command message | parsed message payload |
| `call` | incoming call offer | call array |
| `messages.update` | poll votes, edits | updates array |
| `message.delete` | message deleted | delete info |
| `group.add` / `group.remove` | member join / leave | `{ action, jid, author, member }` |
| `group.promote` / `group.demote` | admin change | `{ action, jid, author, member }` |
| `group.subject` / `group.desc` | group name / description change | update object |
| `group.announce` / `group.restrict` | group settings change | update object |
| `group.memberAddMode` / `group.joinApprovalMode` | join settings change | update object |
| `baileys:<event>` | raw Baileys mirror | raw data |

`Platform` re-maps WhatsApp `prepare` to `ready`, so `wa.on('ready', ...)` works on every platform.

```javascript
wa.on('call', async calls => {
  for (const c of calls || []) {
    if (c.status === 'offer') await wa.rejectCall(c.id, c.from)
  }
})
```

<details>
<summary><b>Group events and raw Baileys mirror</b></summary>

```javascript
wa.on('group.add', x => console.log('join:', x.member, 'by', x.author))
wa.on('group.subject', x => console.log('new subject:', x.subject))
wa.on('baileys:group.join-request', u => console.log('join request', u))
```

</details>

### Send text and media

| Method | Function |
|---|---|
| `sendMessage(jid, content, options)` | raw send |
| `reply(jid, text, quoted)` | quick text reply |
| `sendMessageModify(jid, text, quoted, preview)` | text with link preview options |
| `sendLinkPreview(jid, text, quoted, preview)` | text + fetched link preview |
| `sendFile(jid, src, filename, caption, quoted)` | file from URL, path, or Buffer |
| `sendSticker(jid, bufOrPath, quoted, meta)` | webp sticker with pack meta |
| `sendPoll(jid, question, options, quoted)` | native poll |
| `sendReact(jid, key, emoji)` | emoji reaction |
| `sendContact(jid, name, number, quoted)` | vCard contact |
| `sendPtv(jid, src, quoted, caption)` | video note (round video) |
| `sendAlbumMessage(jid, items, quoted)` | media album |
| `sendProgress(jid, text, steps, quoted)` | progress message edited per step |
| `replyAI(jid, text, quoted)` | AI-styled reply |

```javascript
const wa = Platform.whatsapp

await wa.reply(sock, chat, 'Hello', m)
await wa.sendFile(sock, chat, 'https://example.com/song.mp3', 'song.mp3', 'Here', m)
await wa.sendSticker(sock, chat, buffer, m, { packname: 'akano', author: 'bot' })
await wa.poll(sock, chat, 'Lunch?', ['Rice', 'Noodles'])
```

### Groups presence and channels

| Method | Function |
|---|---|
| `groupAdmin(chat, action, users)` | `promote`, `demote`, `add`, or `remove` |
| `groupApprove(chat, users, approve)` | approve or reject join requests |
| `groupInvite(participant, groupJid, code, ttl, name, caption)` | send a group invite |
| `groupStatus(jid, content)` | post a status update |
| `newsletterQuery(type, jid)` | channel metadata, `null` on fail |
| `broadcast(jids, content, gapMs)` | queued send with delay between chats |
| `typing(chat, action, ms)` | `composing`, `recording`, `paused` |
| `markRead(sock, key)` | blue-tick a message |
| `presenceSubscribe(jid)` | subscribe to presence updates |

```javascript
const wa = Platform.whatsapp

await wa.groupAdmin(sock, '120363xxx@g.us', 'promote', ['62812xxxxxxx@s.whatsapp.net'])
await wa.groupApprove(sock, '120363xxx@g.us', ['62812xxxxxxx@s.whatsapp.net'], true)
await wa.broadcast(sock, [jid1, jid2], jid => ({ text: 'Hi' }), 1500)
await wa.typing(sock, chat, 'composing', 3000)
```

### Polls

Poll votes arrive encrypted through `messages.update`, so use the watcher instead of reading messages.

| Method | Function |
|---|---|
| `sendPoll(jid, question, options, quoted)` | create a poll |
| `watchPoll(fn)` | tally updates `(key, tally, updates)` |
| `getCachedMessage(key)` | lookup original message for a vote key |
| `tallyPoll(message)` | count options from a poll creation message |

```javascript
const wa = Platform.whatsapp

wa.watchPoll(sock, async key => wa.client.getCachedMessage(key), (key, tally) => console.log(tally))
```

### Message object

Every incoming message is serialized to `m` with helpers attached.

| Field | Meaning |
|---|---|
| `m.sender` / `m.chat` | sender JID / chat JID |
| `m.text` / `m.args` / `m.command` | text, args array, command name |
| `m.isCommand` | true when text starts with prefix |
| `m.quoted` | quoted message or `null` |
| `m.isForwarded` / `m.forwardScore` | forward flags |
| `m.isBaileys` / `m.fromMe` | bot noise / own message flags |
| `m.reply()` / `m.react()` | reply and react |
| `m.download()` / `m.copy()` | download media / copy message |
| `m.forward()` / `m.copyNForward()` | forward helpers |
| `m.delete()` | delete own message |

```javascript
// plugins/who.js
module.exports = {
  name: 'who',
  run: async m => {
    await m.reply('You: ' + m.sender + ' in ' + m.chat)
  }
}
```

<details>
<summary><b>Forward, copy, delete, download</b></summary>

| Method | Function |
|---|---|
| `forward(jid, msg, force, options)` | forward a message |
| `copyNForward(jid, msg, force, options)` | copy then forward |
| `deleteMessage(jid, keyOrId)` | delete a message |
| `downloadMediaMessage(msg, kind)` | media to Buffer |
| `download(msg, kind, save)` | helper, optional save to path |
| `media(msg, kind)` | media helper |
| `forwardInfo(msg)` | `{ forwarded, score }` |
| `kindOf(msg)` | message type string |
| `mention(text)` | extract mentioned JIDs |

```javascript
const wa = Platform.whatsapp

const buf = await wa.download(m, 'image')
await wa.forward(sock, otherChat, m)
await wa.deleteMessage(sock, chat, sent.key)
console.log(wa.forwardInfo(m))
```

Self-reply guards are built in: own sends, `@newsletter`, `@broadcast`, and `status@broadcast` are dropped as noise, while own-account messages still work as owner commands.

</details>

<details>
<summary><b>Buttons (nativeFlow, max 10)</b></summary>

Button ids ARE commands — id `.ping` runs the ping plugin on tap.

| Builder | Purpose |
|---|---|
| `quick(id, label)` | inline reply, returns `id` on tap |
| `url(link, label)` | open URL |
| `copy(code, label)` | copy to clipboard |
| `call(number, label)` | dial number |
| `section(title, rows)` | one dropdown section |
| `menu(label, sections)` | multi-section dropdown |
| `sendButtons(jid, text, list, footer, quoted, media, flow)` | send them |
| `sendIAMessage(jid, list, quoted, opts)` | interactive message variant |
| `tap(message)` | read tapped id, or `null` |
| `normInteractive(input)` | normalize one button input |

Media header: `{ image }`, `{ video }`, `{ video, gif: true }`, or `{ location: { lat, lng }, title }`.

```javascript
const wa = Platform.whatsapp

await wa.buttons(sock, chat, 'Pick:', [['vote-yes', 'Yes'], ['vote-no', 'No']])
await wa.buttons(sock, chat, 'Links:', [wa.url('https://example.com', 'Open'), wa.copy('CODE123', 'Copy')])
await wa.buttons(sock, chat, 'Eat:', [wa.section('Menu', [['rice', 'Rice'], ['noodle', 'Noodles']])])

const id = wa.tap(m.message)
if (id) console.log('tapped', id)
```

</details>

<details>
<summary><b>Rich HTML, Meta blocks, Carousel, Ads</b></summary>

| Method | Function |
|---|---|
| `sendHtml(jid, opts)` | HTML card, always forwarded (required for render) |
| `sendMetaMsg(jid, blocks, opts)` | Meta-style AI blocks |
| `sendRichResponse(jid, blocks, opts)` | rich response blocks |
| `carousel(jid, cards, opts)` | swipeable cards |
| `sendAd(jid, text, ad, quoted)` | message with ad reply context |
| `adReply(options)` | build the ad context object |
| `flow(messageParamsJson)` | interactive flow button |

```javascript
const wa = Platform.whatsapp

await wa.sendHtml(sock, chat, { id: 'promo', title: 'Promo', html: '<b>Hi</b>', source: 'sdk', quoted: m })

await wa.sendMetaMsg(sock, chat, [
  { text: 'Result:' },
  { code: 'console.log(42)', language: 'javascript' },
  { table: { title: 'Score', headers: ['Name', 'Points'], rows: [['A', '10']] } }
], { title: 'Demo', footer: 'sdk', quoted: m })

await wa.carousel(sock, chat, [
  { image: 'https://example.com/a.jpg', title: 'Card 1', body: 'Body 1', footer: 'F1', buttons: [{ id: 'c_1', text: 'Pick' }] },
  { video: 'https://example.com/b.mp4', title: 'Card 2', body: 'Body 2', buttons: [] }
], { text: 'Catalog', quoted: m })
```

</details>

<details>
<summary><b>Group verification (captcha gate)</b></summary>

Join request goes to the group, captcha goes to DM, correct answer approves the member.

| Export | Function |
|---|---|
| `verify.createVerifier(opts)` | `{ onJoinRequest, handleReply, sweepExpired }` |
| `verify.generateCaptcha(len)` | random captcha string |
| `verify.STATUS` | pending / approved / expired states |

```javascript
const { verify } = require('@kutashiakanocanzy/sdk')

const gate = verify.createVerifier({
  config: { captchaLength: 6, expiresIn: 300000, maxAttempts: 3 },
  state: {},
  chats: groupSettingsMap,
  save: async () => {}
})

wa.on('baileys:group.join-request', u => gate.onJoinRequest(wa.client.sock, u))
// inside the message handler:
await gate.handleReply(wa.client.sock, m)
```

</details>

<details>
<summary><b>VoIP calls (external engine)</b></summary>

Baileys only detects and rejects calls. Real voice or video needs an external engine process.

| Export | Function |
|---|---|
| `rejectCall(callId, callFrom)` | reject one call |
| `watchCalls(fn)` | auto-handle every incoming call |
| `callFor(sock, opts)` | create the VoIP wrapper |
| `VoiceCall` | low-level call class |
| `RESOLUTIONS` | `240p` to `1080p` |

Env: `VOIP_ENGINE`, `VOIP_FFPROBE`, `VOIP_LOG` (default `warn`), `VOIP_TMPDIR`.

```javascript
const { callFor } = require('@kutashiakanocanzy/sdk')

wa.watchCalls(sock, c => wa.rejectCall(sock, c.id, c.from))

const voip = callFor(sock, { engineFile: '/path/to/engine/index.js' })
const call = await voip.call('62812xxxxxxx', 'https://example.com/audio.mp3', '480p', { autoEndCall: true })
call.on('connected', () => console.log('talking'))
await voip.end()
```

Media can be `'silence'`, a URL or path, a playlist array, or `{ video }` / `{ audio }`.

</details>

## Telegram

Needs `grammy`. Proxy-aware (`HTTPS_PROXY` supported).

| Helper | Function |
|---|---|
| `readMsg(ctx)` | `{ chatId, userId, username, text, messageId, files, reply, video, react, download }` |
| `typing(ctx)` | typing action |
| `presence(ctx)` | presence action |
| `reply(ctx, text, opts)` | reply to a message |
| `sendVideo(ctx, bufOrUrl, opts)` | send video |
| `sendLivePhoto(ctx, bufOrUrl, opts)` | live photo |
| `sendVote(api, chatId, q, options)` | send a poll |
| `keyboard(rows)` | inline keyboard builder |
| `answerTap(ctx, text)` | answer a callback query |
| `sendReact(ctx, emoji)` | react to a message |
| `deleteMessageReaction(ctx)` | remove a reaction |
| `fetchFile(ctx, fileId)` | download a file |
| `mediaFile(ctx)` | pick media from a message |
| `setBio(text)` / `setName(text)` | update bot profile |
| `setShortDescription(text)` | update short description |
| `sendRetry(api, ...)` | send with auto retry |
| `Esc(text)` / `chop(text, len)` | escape HTML / truncate |
| `isConflict(err)` | true on 409 double-polling |
| `classifyError(err)` | error kind string |

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')
const tg = Platform.telegram

const msg = tg.readMsg(ctx)
await tg.typing(ctx)
await tg.sendVideo(ctx, bufOrUrl, { caption: 'Here' })
await tg.answerTap(ctx, 'Saved!')
await tg.sendReact(ctx, '👍')
```

## Discord

Needs `discord.js` (minimum intent `Guilds`).

### Basics

| Helper | Function |
|---|---|
| `readMsg(msg)` | `{ chatId, guildId, userId, text, attachments, reply, react, editReply, followUp, thread }` |
| `card()` | embed builder |
| `button(id, label)` | button builder |
| `actionRow(buttons)` | action row builder |
| `icons(dir)` | load custom icons |
| `attach(file)` / `thumb(url)` | attachments and thumbnails |
| `meter(now, max, len)` | progress bar string |
| `clock(ms)` | `90000` becomes `1m 30s` |
| `md(text)` / `chop(text, len)` | markdown helpers |
| `typing(msg)` | typing indicator |
| `thinking(interaction)` | defer, for work longer than 3s |
| `editReply(interaction, text)` | edit a deferred reply |
| `followUp(interaction, text)` | extra message after reply |
| `poll(options)` | poll builder |
| `watch(client, fn)` | watch every message |
| `clear(messages)` | bulk delete |

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')
const dc = Platform.discord

const card = dc.card().setColor('#5865F2').setTitle('Hi')
const row = dc.actionRow([dc.button('buy', 'Buy'), dc.button('no', 'Cancel')])
await dc.typing(message)

const m = dc.readMsg(message)
await m.reply('Hello!')
```

### Voice

| Method | Function |
|---|---|
| `join(opts)` | `{ channelId, guildId, adapterCreator }` |
| `play(source, opts)` | play file, URL, or stream |
| `stop()` | stop playback |
| `silent(bool)` | mute or unmute |
| `leave()` | leave the channel |

Events: `connected`, `playing`, `idle`, `stopped`, `error`, `ended`.

```javascript
const { DiscordVoice } = require('@kutashiakanocanzy/sdk')

const vc = new DiscordVoice()
vc.join({ channelId, guildId, adapterCreator: interaction.guild.voiceAdapterCreator })
vc.play('https://example.com/song.mp3')
vc.on('idle', () => vc.leave())
```

`sdk/voice.ts` also exposes opus helpers (`opus`, `encoder`, `encodePcm`, `decodeOpus`) for raw pipelines.

### Slash commands

`.discord` plugin handlers register as slash commands automatically (global register takes about 1 hour; instant when `discord_guild_id` is set).

```javascript
// plugins/ping.js
module.exports.discord = {
  command: ['ping'],
  run: async interaction => interaction.reply('Pong!')
}
```

## Plugins

### WhatsApp plugin

```javascript
// plugins/ping.js
module.exports = {
  name: 'ping',
  command: ['ping', 'p'],
  description: 'Check latency',
  run: async (m, { conn, args, command }) => {
    const t0 = Date.now()
    await m.reply('Pong! ' + (Date.now() - t0) + 'ms')
  }
}
```

WhatsApp handler signature is `run(m, extra)` where `extra` holds `{ conn, sock, args, command, plugins }`. Message fields: `m.sender`, `m.chat`, `m.text`, `m.command`, `m.args`, `m.isCommand`, `m.quoted`, `m.reply()`, `m.react()`, `m.download()`. Watch all traffic with `wa.on('import', x => {})`.

### Telegram and Discord plugins

```javascript
// plugins/ping.js
module.exports.telegram = {
  command: ['ping'],
  run: async ctx => ctx.reply('Pong!')
}

module.exports.discord = {
  command: ['ping'],
  run: async interaction => interaction.reply('Pong!')
}
```

Aliases also work: `wa` for `whatsapp`, `tg` for `telegram`, `dc` for `discord`.

### Unified plugin with define

`define()` builds all six handlers (`whatsapp`, `telegram`, `discord`, `wa`, `tg`, `dc`) from one `run(ctx)` with per-user cooldown.

| Field | Meaning |
|---|---|
| `name` / `names` / `command` | trigger names (string or array) |
| `description` / `help` | shown in menu |
| `tags` / `category` | menu grouping |
| `use` | usage example string |
| `options` | slash-command options |
| `cooldown` | seconds per user |
| `run(ctx)` | unified handler |

`DefineContext`: `{ platform, text, args, named, user, reply, raw }`.

```javascript
const { define } = require('@kutashiakanocanzy/sdk')

module.exports = define({
  name: ['profile', 'me'],
  description: 'Show your profile',
  cooldown: 3,
  run: async ctx => ctx.reply(`Hi ${ctx.user.name} via ${ctx.platform}`)
})
```

Cooldown is per `name:user`. When hit, the bot replies with the cooldown message and skips `run`.

## Runtime

Database + autosave + RAM guard in one call.

| Option | Meaning |
|---|---|
| `platforms` | `'whatsapp,telegram,discord'` or `'all'` |
| `whatsapp` | options passed to `Connection` |
| `telegramToken` / `telegram_token` | Telegram token |
| `discordToken` / `discord_token` | Discord token |
| `databaseUrl` | `null` = JSON, or `mongo://`, `redis://`, `mysql://`, `postgres://`, `sqlite://` |
| `databaseName` | collection or file prefix, default `'sdk'` |
| `saveInterval` | autosave ms, default `120000` |
| `ramLimit` | RSS bytes that trigger `onMemoryLimit` |
| `onEvent(platform, evt, data)` | one listener for every platform |
| `onMemoryLimit(rss)` | RAM guard callback |

```javascript
const { runtime } = require('@kutashiakanocanzy/sdk')

const bot = runtime.createRuntime({
  platforms: 'whatsapp,telegram,discord',
  whatsapp: { plugins_dir: './plugins', session_dir: './session' },
  telegramToken: '123456:ABCDEF',
  discordToken: 'YOUR_DISCORD_TOKEN',
  databaseUrl: null,
  databaseName: 'sdk',
  saveInterval: 120000,
  ramLimit: 805306368,
  onEvent: (platform, evt, x) => console.log(`[${platform}]`, x.message || x)
})

await bot.start()
await bot.stop()
```

`bot.start()` returns the runtime with `bot.whatsapp`, `bot.telegram`, `bot.discord`, and `bot.data` (`{ users, groups, chats, setting }`).

## Database Auth and Sessions

### Database

One API over JSON, SQLite, MongoDB, Redis, MySQL, and Postgres. Pick by URL scheme.

| URL | Backend | Needs |
|---|---|---|
| `null` | JSON file | nothing |
| `sqlite://./bot.db` | SQLite | `better-sqlite3` |
| `mongodb://...` / `mongodb+srv://...` | MongoDB | `mongodb` |
| `redis://...` | Redis | `ioredis` |
| `mysql://...` | MySQL | `mysql2` |
| `postgres://...` / `postgresql://...` | Postgres | `pg` |

```javascript
const { Database } = require('@kutashiakanocanzy/sdk')

const { database } = Database.create(null, 'sdk')
await database.save({ users: {} })
const data = await database.fetch()
```

### Auth state on any backend

| Helper | Function |
|---|---|
| `auth.createAuthState(url, name)` | `{ state, saveCreds }` on any DB |
| `auth.authUrl(protocol, target)` | build a DB URL from parts |

```javascript
const { auth } = require('@kutashiakanocanzy/sdk')

const handle = await auth.createAuthState('mongodb://localhost:27017', 'wa-session')
```

### Per-user session store

| Method | Function |
|---|---|
| `createSession(opts)` | `{ get, set, session, clear }` with defaults and save hook |
| `get(id)` | read one user state |
| `set(id, patch)` | merge and persist |
| `session(id)` | get or create with defaults |
| `clear(id)` | reset one user |

```javascript
const { session } = require('@kutashiakanocanzy/sdk')

const store = session.createSession({ defaults: { xp: 0 }, save: async (id, d) => db.save(id, d) })
await store.set(userId, { xp: 5 })
```

### Multi-bot sessions manager

| Method | Function |
|---|---|
| `createSessions(opts)` | manager over a directory |
| `loadAll()` | list known account ids |
| `info(id)` | `{ id, status, phoneNumber, updatedAt }` |
| `create(id, opts)` | start one more bot account |
| `stop(id)` | stop one account |
| `validateSession(dir)` | `{ valid, reason }` check |

Status values: `stopped`, `starting`, `online`, `offline`, `loggedOut`.

```javascript
const { sessions } = require('@kutashiakanocanzy/sdk')

const mgr = sessions.createSessions({ dir: './sessions' })
await mgr.create('bot1', { platform: 'whatsapp', pairing: { state: true, number: '62812xxxxxxx' } })
```

## Tools

### Text and menu

`Function` (also `Platform.core` and `sdk/text.ts`) formats per platform: bold on WhatsApp is `*Hi*`, on Telegram `<b>Hi</b>`, on Discord `**Hi**`.

| Helper | Function |
|---|---|
| `B(text, platform)` / `I()` / `Code()` / `Strike()` / `Link()` | platform-aware format |
| `Esc(text)` / `sanitize(text)` | escape markup |
| `splitSmart(text, len)` | split long text cleanly |
| `stripMd(text)` | remove markdown |
| `greeting(date)` | morning / afternoon / evening |
| `similarity(a, b)` | 0 to 1 string match |
| `role(level)` / `xpForLevel(n)` / `levelStats(xp)` | game levels |
| `toBytes(str)` / `getSize` / `formatSize` | size helpers |
| `mention` / `parseMention` | mention helpers |
| `toTime` / `toTimeShort` / `toDate` | time helpers |
| `matcher` / `ucword` / `delay` / `uuid` | misc helpers |
| `TG_TEXT_MAX` / `TG_CAPTION_MAX` / `TG_PHOTO_MAX` | Telegram limits |

```javascript
const { Function, menu } = require('@kutashiakanocanzy/sdk')

Function.B('Hi', 'telegram')

const c = menu.collect(plugins, { hidden: ['main'] })
await m.reply(menu.renderText(c, { prefix: '.', header: 'Hi', footer: 'bot' }))
```

Menu API:

| Helper | Function |
|---|---|
| `collect(plugins, opts)` | group plugins by tags |
| `box(items, prefix)` | box-style list |
| `renderText(collected, opts)` | plain text menu |
| `renderSections(collected, opts)` | section array for buttons |
| `fillTemplate(text, vars)` | `{name}` placeholder fill |
| `paginate(items, page, perPage)` | slice a list |
| `renderPage(collected, opts)` / `pageId` / `parsePageId` / `pageKeyboard` | paged menu with buttons |

### I18n and scheduler

Built-in English and Indonesian strings: `cooldown`, `error`, `banned`, `expired`, `success`, `wrongCode`, `noPermission`.

| Helper | Function |
|---|---|
| `t(lang, key, vars)` | translate, `{s}` style placeholders |
| `addStrings(lang, dict)` | add or override strings |
| `schedule(name, cron, fn, opts)` | cron job with timezone |
| `stop(name)` / `list()` / `stopAll()` | manage jobs |

```javascript
const { i18n, scheduler } = require('@kutashiakanocanzy/sdk')

i18n.t('id', 'cooldown', { s: 5 })
i18n.addStrings('id', { hello: 'Halo {name}' })
scheduler.schedule('backup', '0 */2 * * *', () => saveDb(), { timezone: 'Asia/Jakarta' })
```

### Cards

PNG cards rendered with sharp: `welcome`, `goodbye`, `rankCard`, `profileCard`, `levelUpCard`, `certificate`.

```javascript
const { cards } = require('@kutashiakanocanzy/sdk')

await conn.sendMessage(chat, { image: await cards.welcome('Bo', 'Grup', 42), caption: 'Welcome!' })
await conn.sendMessage(chat, { image: await cards.rankCard({ name: 'Bo', level: 5, rank: 3, xp: 150, maxXp: 200 }) })
```

### AI rich messages

`AIRichBuilder` composes forwarded AI-style blocks, then sends them through a connected socket.

| Method | Function |
|---|---|
| `setTitle(t)` / `setFooter(f)` | header and footer |
| `addText(t)` / `addTip(t)` | text and tip block |
| `addCode(lang, code)` | highlighted code |
| `addTable(rows)` | table block |
| `addImage(src)` | image block |
| `addSuggest(s)` / `addProcess(t)` / `addSource(list)` | suggestions, process, sources |
| `build(opts)` | message object |
| `send(jid, opts)` | needs a bound client |
| `aiRichBuilderFromSpec(spec)` | build from a plain object |
| `extractInlineEntities(text)` | inline entity parser |
| `tokenizeAIRichCode(code, lang)` | code highlighter tokens |

```javascript
const { airich } = require('@kutashiakanocanzy/sdk')

const b = new airich.AIRichBuilder()
b.setTitle('Demo').addText('Hello').addCode('javascript', 'const a = 1;')
await sock.sendMessage(chat, b.build({ forwarded: false }))
```

### Wizard

Multi-step question flow with timeout and per-user state.

```javascript
const { wizard } = require('@kutashiakanocanzy/sdk')

const quiz = new wizard.Wizard([{ prompt: 'Name?', key: 'name' }])
new wizard.WizardRunner(() => quiz, {
  send: async (id, text) => sock.sendMessage(id, { text }),
  onDone: async (id, data) => console.log(id, data),
  timeoutMs: 120000
})
```

### Anti delete

| Helper | Function |
|---|---|
| `watchAntiDelete(conn, fn)` | resend deleted WhatsApp messages |
| `watchAntiDeleteDiscord(client, fn)` | same for Discord |
| `trackFromSerialized(m)` | store one message manually |
| `AntiDeleteStore` | storage class |

```javascript
const { antidelete } = require('@kutashiakanocanzy/sdk')

antidelete.watchAntiDelete(conn, d => conn.sendMessage(d.chat, { text: 'Deleted: ' + d.text }))
```

### Scraper

| Helper | Function |
|---|---|
| `shorten(url)` | shorten a long URL |
| `upload(buffer, filename)` | upload a file, returns URL |
| `viewSource(url)` | fetch page source |

```javascript
const { Scraper } = require('@kutashiakanocanzy/sdk')

await Scraper.shorten('https://example.com/very/long/url')
await Scraper.upload(buffer, 'pic.jpg')
```

### Proxy

Honors `HTTPS_PROXY` and `NO_PROXY` env. Used by Telegram and fetches.

| Helper | Function |
|---|---|
| `getProxyUrl(opts)` | resolve proxy URL |
| `shouldProxy(url)` | false for NO_PROXY hosts |
| `proxyFetch(url, opts)` | fetch through proxy when needed |
| `getProxyAgent()` / `createProxyAgent(url)` / `getFetchAgent(url)` | agents |
| `parseNoProxy(list)` / `normalizeProxyUrl(url)` | parsing helpers |

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')
const proxy = Platform.common.proxy

proxy.getProxyUrl({ proxy: 'http://user:pass@host:8080' })
proxy.shouldProxy('https://api.telegram.org')
```

### Permission cooldown and queue

| Helper | Function |
|---|---|
| `getPermission(userId, opts)` | owner, premium, admin check |
| `isOwner(id)` / `isPremium(id)` / `isAdmin(id)` / `isBotAdmin(id)` | single checks |
| `Cooldown` / `SpamDetection` | rate limit classes |
| `Queue` | serial task queue |
| `isLink(text)` / `isVirtex(text)` / `extractLinks(text)` | anti-link and anti-virtex |
| `AntiDelete` | anti-delete class variant |
| `need(name)` / `freshRequire(path)` | optional deps and fresh loader |

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')
const permission = Platform.common.permission

if (!permission.isOwner(sender)) return m.reply('Owner only')
```

### Converter Exif and media

| Helper | Function |
|---|---|
| `Converter.toPTT(src, out)` | audio to voice note |
| `Converter.toAudio(src, out)` | extract audio |
| `Converter.toVideo(src, out)` | convert to video |
| `Converter.webpToMp4(src)` | sticker back to video |
| `Exif.writeExifImg/Webp/Vid` | sticker pack metadata |
| `Exif.imageToWebp(buf)` / `Exif.videoToWebp(buf)` | sticker convert |
| `Spam.check(text)` | spam score check |

Needs `ffmpeg` and `ffprobe` in PATH.

```javascript
const { Converter, Exif } = require('@kutashiakanocanzy/sdk')

await Converter.toPTT('in.mp3', 'out.ogg')
await Exif.writeExifImg('in.webp', { packname: 'akano', author: 'bot' })
```

## Configuration

`loadConfig()` reads `config.json` in the working directory:

| Key | Description | Env fallback |
|---|---|---|
| `pairing_number` | WA pairing number, no `+` | `BOT_NUMBER`, `PAIRING_CODE` |
| `pairing_code` | WA pairing code | `PAIRING_CODE` |
| `telegram_token` | BotFather token | `TELEGRAM_TOKEN` |
| `discord_token` | Developer Portal token | `DISCORD_TOKEN` |
| `prefix` | WA prefix, default `.` | `BOT_PREFIX` |

```javascript
const { loadConfig } = require('@kutashiakanocanzy/sdk')

const cfg = loadConfig()
console.log(cfg.prefix)
```

Other env vars used by the SDK: `HTTPS_PROXY`, `NO_PROXY`, `VOIP_ENGINE`, `VOIP_FFPROBE`, `VOIP_LOG`, `VOIP_TMPDIR`.

## Project Structure

```
index.ts          package entry (re-exports lib)
lib/              WhatsApp core: connection, serialize, database, auth, scraper, converter, exif, spam, function
lib/voip/         external-engine voice wrapper (callFor, VoiceCall)
sdk/              adapters: whatsapp, telegram, discord, discordVoice, voice
sdk/common/       anti, converter, cooldown, permission, proxy, queue
sdk/              define, platform-class, loader, runtime, menu, verify
sdk/              text, core, i18n, scheduler, wizard, session, sessions
sdk/              cards, airich, buttons, antidelete, config
dist/             build output (gitignored): cjs (require) + esm (import)
test/             node:test suites run after build
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Missing `grammy` / `discord.js` | install only for platforms you use |
| QR never shows | delete `session_dir`, restart |
| Logged out loop | delete `session_dir`, scan again |
| Plugin not loading | `node --check`, ensure `module.exports`, `.js` extension |
| Plugin syntax error in log | fix the file, chokidar reloads it |
| Discord `interaction failed` | call `thinking()` / `deferReply()` first for work over 3s |
| No Discord voice | `join()` then `play()` after connect, `ffmpeg` in PATH |
| grammy 409 conflict | stop the other instance polling the same token |
| Buttons do not render | needs the `baileys_helper` dep |
| `VOIP engine is not configured` | set `opts.engineFile` or `VOIP_ENGINE` |
| Rich HTML must stay forwarded | forwarded envelope is required for render, cannot disable |
| Poll votes look empty | votes arrive via `messages.update`, use `watchPoll` |
| Tapped button id is null | only `quick_reply` and `single_select` return ids |

## TypeScript

Sources are TypeScript (`strict: false`, typed public APIs). The package ships both module systems plus declarations.

```javascript
const { Platform } = require('@kutashiakanocanzy/sdk')
```

```typescript
import { Platform, DiscordVoice, callFor } from '@kutashiakanocanzy/sdk'
import type { PlatformOptions, ButtonInput, HtmlOptions } from '@kutashiakanocanzy/sdk'
```

```bash
npm run build # build:cjs -> dist/cjs, build:esm -> dist/esm
npm run typecheck # tsc --noEmit
npm test # build then node --test test/*.test.mjs
```

```javascript
// Semua helper bisa diimpor langsung dari root (flat, tanpa deep path):
const { Cooldown, Queue, resize, texted, reply, media, smsg, AIRichBuilder } = require('@kutashiakanocanzy/sdk')
```

Deep imports tetap didukung untuk development: `@kutashiakanocanzy/sdk/lib/voip`, `@kutashiakanocanzy/sdk/sdk/*`, `@kutashiakanocanzy/sdk/lib/*`.

## Limitations

- `define()` only gates per-user `cooldown` — no built-in `owner`/`group`/`admin`/`premium` gates, check those in `run()` yourself.
- WhatsApp `Connection` has no proxy option — `HTTPS_PROXY`/`proxy` only applies to Telegram (`grammy`) and `proxyFetch`/converter fetches.
- Types: `strict: false`, public APIs typed, WhatsApp raw payloads are largely `any`/`unknown` — validate at runtime.
