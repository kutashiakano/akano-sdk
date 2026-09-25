import fs from "node:fs";
import path from "node:path";

export interface BotConfig {
  pairing_number: string;
  pairing_code: string;
  telegram_token: string;
  discord_token: string;
  prefix: string;
}

export const DEFAULTS: BotConfig = {
  pairing_number: "",
  pairing_code: "",
  telegram_token: "",
  discord_token: "",
  prefix: "."
};

export function loadConfig(): BotConfig {
  const cfg: BotConfig = { ...DEFAULTS };
  const files = [path.join(process.cwd(), "config.json"), path.join(__dirname, "..", "config.json")];
  for (const f of files) {
    try {
      const local = JSON.parse(fs.readFileSync(f, "utf8")) as Partial<BotConfig>;
      for (const k of Object.keys(DEFAULTS) as (keyof BotConfig)[]) {
        if (local[k] !== undefined && local[k] !== "") cfg[k] = local[k] as string;
      }
      break;
    } catch {  }
  }
  return cfg;
}
