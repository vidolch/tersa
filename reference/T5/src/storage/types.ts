export interface Link {
  code: string;
  url: string;
  createdAt: string;
  expiresAt: string | null;
  clicks: number;
}

/** The only boundary through which persistence happens (T4 R5). */
export interface LinkStore {
  /** Returns false if the code already exists. */
  create(link: Omit<Link, "clicks">): boolean;
  get(code: string): Link | null;
  /** Returns false if the code did not exist. */
  delete(code: string): boolean;
  /** Atomically adds one click to the link and to its bucket for `date` (YYYY-MM-DD, UTC). */
  recordClick(code: string, date: string): void;
  /** Click counts per date in [from, to], dates without clicks omitted. */
  daily(code: string, from: string, to: string): Map<string, number>;
  close(): void;
}
