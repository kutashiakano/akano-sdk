export interface WizardStep {
  prompt: string | ((data: Record<string, unknown>) => string);
  key?: string;
  parse?: (text: string) => { ok: true; value: unknown } | { ok: false; error: string };
}

export type WizardResult = { done: false; text: string } | { done: true; data: Record<string, unknown> };

export class Wizard {
  readonly steps: WizardStep[];
  private index = 0;
  private data: Record<string, unknown> = {};

  constructor(steps: WizardStep[] = []) {
    this.steps = steps;
  }

  private render(step: WizardStep): string {
    return typeof step.prompt === "function" ? step.prompt(this.data) : String(step.prompt);
  }

  start(): WizardResult {
    this.index = 0;
    this.data = {};
    if (!this.steps.length) return { done: true, data: {} };
    return { done: false, text: this.render(this.steps[0]) };
  }

  next(answer: string): WizardResult {
    const step = this.steps[this.index];
    if (!step) return { done: true, data: { ...this.data } };
    const text = String(answer || "").trim();
    if (step.parse) {
      const parsed = step.parse(text) as { ok: boolean; value?: unknown; error?: string };
      if (!parsed.ok) return { done: false, text: String(parsed.error || "Invalid input.") };
      this.data[step.key ?? String(this.index)] = parsed.value;
    } else {
      this.data[step.key ?? String(this.index)] = text;
    }
    this.index++;
    const following = this.steps[this.index];
    if (!following) return { done: true, data: { ...this.data } };
    return { done: false, text: this.render(following) };
  }

  get progress(): { step: number; total: number } {
    return { step: Math.min(this.index + 1, this.steps.length), total: this.steps.length };
  }
}

export interface WizardRunnerOptions {
  send: (key: string, text: string) => Promise<unknown>;
  onDone?: (key: string, data: Record<string, unknown>) => Promise<unknown> | unknown;
  timeoutMs?: number;
}

export class WizardRunner {
  private sessions = new Map<string, { wizard: Wizard; timer?: ReturnType<typeof setTimeout> }>();
  private make: () => Wizard;
  private opts: WizardRunnerOptions;

  constructor(make: () => Wizard, opts: WizardRunnerOptions) {
    this.make = make;
    this.opts = opts;
  }

  active(key: string): boolean {
    return this.sessions.has(String(key));
  }

  async start(key: string): Promise<void> {
    const id = String(key);
    this.cancel(id);
    const wizard = this.make();
    const first = wizard.start();
    if (first.done === true) {
      await this.opts.onDone?.(id, (first as { data: Record<string, unknown> }).data);
      return;
    }
    this.sessions.set(id, { wizard });
    this.arm(id);
    await this.opts.send(id, (first as { text: string }).text);
  }

  async handle(key: string, text: string): Promise<boolean> {
    const id = String(key);
    const session = this.sessions.get(id);
    if (!session) return false;
    const result = session.wizard.next(text);
    if (result.done === true) {
      this.sessions.delete(id);
      await this.opts.onDone?.(id, (result as { data: Record<string, unknown> }).data);
      return true;
    }
    this.arm(id);
    await this.opts.send(id, (result as { text: string }).text);
    return true;
  }

  cancel(key: string): boolean {
    const id = String(key);
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.timer) clearTimeout(session.timer);
    this.sessions.delete(id);
    return true;
  }

  private arm(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    if (this.opts.timeoutMs && this.opts.timeoutMs > 0) {
      session.timer = setTimeout(() => this.cancel(id), this.opts.timeoutMs);
      if (typeof (session.timer as unknown as { unref?: () => void }).unref === "function") {
        (session.timer as unknown as { unref: () => void }).unref();
      }
    }
  }
}
