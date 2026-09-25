import { createRequire } from "node:module";
import path from "node:path";

type RequireFn = (name: string) => any;

let cached: RequireFn | null = null;

export function need(name: string): any {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.require === "function") return (g.require as RequireFn)(name);
  if (!cached) {
    try {
      cached = createRequire(path.join(process.cwd(), "package.json")) as unknown as RequireFn;
    } catch {
      cached = null;
    }
  }
  if (cached) return cached(name);
  throw new Error(`Cannot load module ${name}: no require available`);
}

export async function needAsync(name: string): Promise<any> {
  try {
    return need(name);
  } catch {
    const importer = Function("n", "return import(n)") as (n: string) => Promise<any>;
    return importer(name);
  }
}

const reqChain = createRequire(path.join(process.cwd(), "package.json"));

export function freshRequire(file: string): any {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.require === "function") {
    const r = g.require as RequireFn & { cache: Record<string, unknown>; resolve: (p: string) => string };
    try {
      delete r.cache[r.resolve(file)];
    } catch {}
    return r(file);
  }
  const local = createRequire(file);
  return local(file);
}

export function chainRequire(): RequireFn {
  return reqChain as unknown as RequireFn;
}
