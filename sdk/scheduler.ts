import cron from "node-cron";

export interface ScheduleOptions {
  timezone?: string;
}

const jobs = new Map<string, ReturnType<typeof cron.schedule>>();

export function schedule(name: string, expr: string, fn: () => void | Promise<unknown>, opts: ScheduleOptions = {}): ReturnType<typeof cron.schedule> {
  if (!cron.validate(expr)) throw new Error("Invalid cron expression: " + expr);
  stop(name);
  const job = cron.schedule(expr, () => {
    void Promise.resolve(fn()).catch(() => {});
  }, opts.timezone ? { timezone: opts.timezone } : undefined);
  jobs.set(name, job);
  return job;
}

export function stop(name: string): boolean {
  const job = jobs.get(name);
  if (!job) return false;
  job.stop();
  jobs.delete(name);
  return true;
}

export function list(): string[] {
  return [...jobs.keys()];
}

export function stopAll(): void {
  for (const name of [...jobs.keys()]) stop(name);
}
