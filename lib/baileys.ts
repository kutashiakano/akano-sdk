const loader = Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

let cached: Promise<unknown> | null = null;

export const baileysHelper: Promise<unknown> = (async function helpers(): Promise<unknown> {
  if (!cached) cached = loader("@whiskeysockets/baileys");
  return cached;
})();
