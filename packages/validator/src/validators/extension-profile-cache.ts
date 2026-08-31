export interface ExtensionProfileCache<Value> {
  get(key: string): Value | undefined;
  set(key: string, value: Value): void;
}
