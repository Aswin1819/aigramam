import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@shared/model";
import type { WorldsState } from "@shared/world";
import type { CharactersState } from "@shared/character";

export type AppMode = "live" | "demo";

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
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === "worlds") {
            setWorlds(msg.payload as WorldsState);
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
  }, [send]);

  const startLive = useCallback(() => {
    modeRef.current = "live";
    setMode("live");
    setSnapshot(EMPTY);
    send("demo-stop");
  }, [send]);

  return { snapshot, worlds, characters, mode, connected, now, startDemo, startLive };
}
