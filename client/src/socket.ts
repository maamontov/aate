import { io, Socket } from "socket.io-client";

const socketHost = window.location.origin;
export const socket: Socket = io(socketHost);
