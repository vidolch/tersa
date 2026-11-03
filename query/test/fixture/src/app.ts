import { add, Counter, double } from "./lib/math";

const handlers: Record<string, (x: number) => number> = {};

handlers['calc/double'] = (x: number) => double(x);

export function total(values: number[]): number {
  return values.reduce((acc, v) => add(acc, v), 0);
}

export function run(): number {
  const c = new Counter();
  c.increment(2);
  return total([c.count, handlers['calc/double'](3)]);
}
