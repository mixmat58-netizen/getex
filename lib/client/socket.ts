import { io, Socket } from "socket.io-client";

export function createClientSocket(token: string): Socket {
  return io({
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: { token },
  });
}

