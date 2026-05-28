import { io, Socket } from "socket.io-client";

const socketHost = `${window.location.protocol}//${window.location.hostname}:3001`;
export const socket: Socket = io(socketHost);
