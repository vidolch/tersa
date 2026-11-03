/** Adds two numbers. */
export function add(a: number, b: number): number {
  return a + b;
}

export const double = (n: number) => add(n, n);

export class Counter {
  count = 0;
  increment(by = 1): number {
    this.count = add(this.count, by);
    return this.count;
  }
}
