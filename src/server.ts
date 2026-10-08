import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import initializeSocket from "./socket/gameHandlers";
import { keepAlive } from "./cron/keepAlive";
import { createMachineTelemetryRouter } from "./telemetry/machineTelemetry";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://playredblack.netlify.app",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.json({ limit: "64kb" }));
app.use(createMachineTelemetryRouter());

// app.use(express.static("public"));

initializeSocket(io);

keepAlive();

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
