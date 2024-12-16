import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import initializeSocket from "./socket/gameHandlers";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://playredblack.netlify.app",
    ],
    credentials: true,
  },
});

// app.use(express.static("public"));

initializeSocket(io);

const PORT = 10000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
