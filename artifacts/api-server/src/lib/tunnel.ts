import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { RawData } from "ws";
import { eq } from "drizzle-orm";
import { db, computersTable } from "@workspace/db";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// WebSocket tunnel — bridges dashboard ↔ agent for real-time remote view.
//
// Two modes of frame delivery:
//   1. JPEG frames  — agent uploads via HTTP, server forwards as JSON {type:"frame",data:base64}
//   2. H.264 video  — agent streams MPEG-TS binary chunks directly over WS
//
// Protocol (JSON messages over WS):
//
//   Dashboard → Server:
//     { type: "start_view" }
//     { type: "stop_view" }
//     { type: "input", payload: object }
//     { type: "set_mode", mode: "jpeg" | "h264" }
//
//   Server → Dashboard:
//     { type: "frame", data: string }         // base64 JPEG
//     { type: "status", connected: boolean }
//     { type: "input_ack", ok: boolean, detail: string }
//     { type: "error", message: string }
//
//   Binary messages: forwarded as-is (MPEG-TS chunks from agent)
// ---------------------------------------------------------------------------

interface AgentConn {
  ws: WebSocket;
  computerId: number;
}

interface DashboardConn {
  ws: WebSocket;
  computerId: number;
  streaming: boolean;
  mode: "jpeg" | "h264";
}

const agents = new Map<number, AgentConn>();
const dashboardByComputer = new Map<number, Set<DashboardConn>>();

function sendJson(ws: WebSocket, obj: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendToAgent(computerId: number, obj: Record<string, unknown>): void {
  const agent = agents.get(computerId);
  if (agent) sendJson(agent.ws, obj);
}

export function broadcastFrame(
  computerId: number,
  base64Data: string,
): void {
  const set = dashboardByComputer.get(computerId);
  if (!set || set.size === 0) return;
  const msg = JSON.stringify({ type: "frame", data: base64Data });
  for (const d of set) {
    if (d.ws.readyState === WebSocket.OPEN && d.streaming && d.mode === "jpeg") {
      d.ws.send(msg);
    }
  }
}

function broadcastBinary(computerId: number, data: Buffer): void {
  const set = dashboardByComputer.get(computerId);
  if (!set || set.size === 0) return;
  for (const d of set) {
    if (d.ws.readyState === WebSocket.OPEN && d.streaming && d.mode === "h264") {
      d.ws.send(data);
    }
  }
}

function notifyDashboardsStatus(computerId: number): void {
  const connected = agents.has(computerId);
  const set = dashboardByComputer.get(computerId);
  if (!set) return;
  for (const d of set) {
    sendJson(d.ws, { type: "status", connected });
  }
}

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/tunnel" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const role = url.searchParams.get("role"); // "agent" | "dashboard"
    const token = url.searchParams.get("token") ?? "";
    const computerIdParam = url.searchParams.get("computerId");

    if (role === "agent") {
      handleAgentConnection(ws, token);
    } else if (role === "dashboard") {
      const computerId = Number(computerIdParam);
      if (!Number.isFinite(computerId) || computerId <= 0) {
        sendJson(ws, { type: "error", message: "Missing or invalid computerId" });
        ws.close(4001, "Missing computerId");
        return;
      }
      handleDashboardConnection(ws, computerId);
    } else {
      sendJson(ws, { type: "error", message: "Missing role parameter" });
      ws.close(4002, "Missing role");
    }
  });

  logger.info("WebSocket tunnel attached at /ws/tunnel");
}

function handleAgentConnection(ws: WebSocket, _token: string): void {
  let computerId = -1;

  ws.on("message", (raw: RawData, isBinary: boolean) => {
    // Binary messages = MPEG-TS chunks → forward to dashboards
    if (isBinary) {
      if (computerId > 0) {
        const buf = Buffer.isBuffer(raw)
          ? raw
          : Buffer.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : String(raw));
        broadcastBinary(computerId, buf);
      }
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "hello" && typeof msg.computerId === "number") {
      computerId = msg.computerId;
      const prev = agents.get(computerId);
      if (prev && prev.ws !== ws) {
        prev.ws.close(4010, "Replaced");
      }
      agents.set(computerId, { ws, computerId });
      sendJson(ws, { type: "hello_ok" });
      notifyDashboardsStatus(computerId);
      logger.info({ computerId }, "Agent WebSocket connected");
      return;
    }

    if (computerId > 0) {
      if (msg.type === "input_ack") {
        broadcastToDashboards(computerId, {
          type: "input_ack",
          ok: msg.ok,
          detail: msg.detail,
        });
      }
    }
  });

  ws.on("close", () => {
    if (computerId > 0) {
      agents.delete(computerId);
      notifyDashboardsStatus(computerId);
      logger.info({ computerId }, "Agent WebSocket disconnected");
    }
  });

  ws.on("error", (err) => {
    logger.warn({ err }, "Agent WebSocket error");
  });
}

function broadcastToDashboards(
  computerId: number,
  obj: Record<string, unknown>,
): void {
  const set = dashboardByComputer.get(computerId);
  if (!set) return;
  for (const d of set) {
    sendJson(d.ws, obj);
  }
}

function handleDashboardConnection(ws: WebSocket, computerId: number): void {
  const conn: DashboardConn = { ws, computerId, streaming: false, mode: "jpeg" };

  let set = dashboardByComputer.get(computerId);
  if (!set) {
    set = new Set();
    dashboardByComputer.set(computerId, set);
  }
  set.add(conn);

  sendJson(ws, { type: "status", connected: agents.has(computerId) });

  ws.on("message", (raw: RawData, isBinary: boolean) => {
    if (isBinary) return; // dashboards don't send binary
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    switch (msg.type) {
      case "set_mode": {
        if (msg.mode === "h264" || msg.mode === "jpeg") {
          conn.mode = msg.mode;
        }
        break;
      }
      case "start_view": {
        conn.streaming = true;
        const until = new Date(Date.now() + 120_000);
        db.update(computersTable)
          .set({ remoteViewUntil: until })
          .where(eq(computersTable.id, computerId))
          .catch(() => {});
        sendToAgent(computerId, { type: "start_view" });
        break;
      }
      case "stop_view": {
        conn.streaming = false;
        const anyStreaming = set && [...set].some((d) => d.streaming);
        if (!anyStreaming) {
          db.update(computersTable)
            .set({ remoteViewUntil: null })
            .where(eq(computersTable.id, computerId))
            .catch(() => {});
          sendToAgent(computerId, { type: "stop_view" });
        }
        break;
      }
      case "input": {
        sendToAgent(computerId, {
          type: "input",
          payload: msg.payload,
        });
        break;
      }
    }
  });

  ws.on("close", () => {
    set?.delete(conn);
    if (set && set.size === 0) {
      dashboardByComputer.delete(computerId);
      db.update(computersTable)
        .set({ remoteViewUntil: null })
        .where(eq(computersTable.id, computerId))
        .catch(() => {});
      sendToAgent(computerId, { type: "stop_view" });
    }
  });

  ws.on("error", (err) => {
    logger.warn({ err }, "Dashboard WebSocket error");
  });
}
