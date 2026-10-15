type Listener = (data: unknown) => void;

export class Emitter<TEvents extends Record<string, unknown>> {
  private map = new Map<string, Set<Listener>>();

  on<K extends keyof TEvents>(event: K, fn: (data: TEvents[K]) => void): () => void {
    let set = this.map.get(event as string);
    if (!set) {
      set = new Set<Listener>();
      this.map.set(event as string, set);
    }
    const listener: Listener = fn as unknown as Listener;
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0 && this.map.get(event as string) === set) this.map.delete(event as string);
    };
  }

  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    this.map.get(event as string)?.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    });
  }
}
