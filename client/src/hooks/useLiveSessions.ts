import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatItem, Snapshot } from "@shared/model";
import type { WorldsState } from "@shared/world";
import type { CharactersState } from "@shared/character";

export type AppMode = "live" | "demo";
export type CommandOutcome = { ok: boolean; error?: string };

const EMPTY: Snapshot = { projects: [], sessions: [], hooks: { installed: false }, serverTime: Date.now(), demo: false };

/**
 * Live Claude Code sessions from the local server.
 * Also returns `now`, the current time on the server's clock (ticks every
 * second), so elapsed times stay right even if the two clocks differ.
 */
/** "?demo" in the address opens straight into the demo village (handy for sharing a screenshot). */
const startInDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

export function useLiveSessions() {
  const [snapshot, setSnapshot] = useState<Snapshot>(startInDemo ? { ...EMPTY, demo: true } : EMPTY);
  const [mode, setMode] = useState<AppMode>(startInDemo ? "demo" : "live");
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [worlds, setWorlds] = useState<WorldsState | null>(null);
  const [characters, setCharacters] = useState<CharactersState | null>(null);
  const modeRef = useRef<AppMode>(startInDemo ? "demo" : "live");
  const wsRef = useRef<WebSocket | null>(null);
  const skewRef = useRef(0);
  const pending = useRef(new Map<string, (r: CommandOutcome) => void>());
  const [chat, setChat] = useState<{ sessionId: string; items: ChatItem[] } | null>(null);
  const chatRef = useRef<string | null>(null);

  const send = useCallback((type: "demo-start" | "demo-stop") => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload: null }));
  }, []);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/agents`);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        if (modeRef.current === "demo") ws.send(JSON.stringify({ type: "demo-start", payload: null }));
        if (chatRef.current) ws.send(JSON.stringify({ type: "chat-open", payload: { sessionId: chatRef.current } }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === "worlds") {
            setWorlds(msg.payload as WorldsState);
            return;
          }
          if (msg?.type === "chat") {
            const c = msg.payload as { sessionId: string; reset: boolean; items: ChatItem[] };
            if (c.sessionId !== chatRef.current) return;
            setChat((prev) => {
              if (c.reset || !prev || prev.sessionId !== c.sessionId) return { sessionId: c.sessionId, items: c.items };
              // A pushed item with a known id replaces it (e.g. "Interrupted" becoming "Stopped from Ai Gramam").
              const byId = new Map(c.items.map((i) => [i.id, i]));
              const items = prev.items.map((i) => byId.get(i.id) ?? i);
              const seen = new Set(prev.items.map((i) => i.id));
              return { sessionId: c.sessionId, items: [...items, ...c.items.filter((i) => !seen.has(i.id))].slice(-400) };
            });
            return;
          }
          if (msg?.type === "command-result") {
            const r = msg.payload as { requestId: string; ok: boolean; error?: string };
            pending.current.get(r.requestId)?.({ ok: r.ok, error: r.error });
            pending.current.delete(r.requestId);
            return;
          }
          if (msg?.type === "characters") {
            setCharacters(msg.payload as CharactersState);
            return;
          }
          if (msg?.type !== "snapshot") return;
          const snap = msg.payload as Snapshot;
          // Ignore a late live snapshot right after switching to demo (and vice versa).
          if (snap.demo !== (modeRef.current === "demo")) return;
          skewRef.current = snap.serverTime - Date.now();
          setSnapshot(snap);
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();

    const tick = setInterval(() => setNow(Date.now() + skewRef.current), 1000);
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(tick);
      wsRef.current?.close();
    };
  }, []);

  const startDemo = useCallback(() => {
    modeRef.current = "demo";
    setMode("demo");
    setSnapshot({ ...EMPTY, demo: true });
    send("demo-start");
    if (chatRef.current) wsRef.current?.send(JSON.stringify({ type: "chat-open", payload: { sessionId: chatRef.current } }));
  }, [send]);

  const startLive = useCallback(() => {
    modeRef.current = "live";
    setMode("live");
    setSnapshot(EMPTY);
    send("demo-stop");
    if (chatRef.current) wsRef.current?.send(JSON.stringify({ type: "chat-open", payload: { sessionId: chatRef.current } }));
  }, [send]);

  /** Send a command to a live session (via the Ai Gramam mod) and wait for the server's answer. */
  const command = useCallback(
    (type: "session-message" | "session-stop" | "approval-decide", payload: Record<string, unknown>): Promise<CommandOutcome> => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, error: "Not connected to Ai Gramam." });
      const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          resolve({ ok: false, error: "No answer from the server." });
        }, 8000);
        pending.current.set(requestId, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
        ws.send(JSON.stringify({ type, payload: { ...payload, requestId } }));
      });
    },
    [],
  );

  /** Follow one session's conversation (null to stop). */
  const openChat = useCallback((sessionId: string | null) => {
    if (chatRef.current === sessionId) return;
    chatRef.current = sessionId;
    setChat(sessionId ? { sessionId, items: [] } : null);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(sessionId ? { type: "chat-open", payload: { sessionId } } : { type: "chat-close", payload: null }));
    }
  }, []);

  return { snapshot, worlds, characters, mode, connected, now, startDemo, startLive, command, chat, openChat };
}
