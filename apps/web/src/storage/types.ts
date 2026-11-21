export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  subscribe<T>(key: string, listener: (value: T | undefined) => void): () => void;
}
