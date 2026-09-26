'use client';

class MockChatSocket {
  private listeners: Map<string, Set<Function>> = new Map();

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  off(event: string, callback?: Function) {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(callback);
    }
    return this;
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error(e); }
    });
    try {
      window.dispatchEvent(new CustomEvent(`chat-socket:${event}`, { detail: data }));
    } catch {}
    return this;
  }

  disconnect() {
    this.listeners.clear();
  }
}

let socketInstance: MockChatSocket | null = null;

export function getChatSocket(accessToken: string | null) {
  if (!socketInstance) {
    socketInstance = new MockChatSocket();
  }
  return socketInstance;
}
