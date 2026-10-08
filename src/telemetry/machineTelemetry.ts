import { Router } from "express";

type MachineTelemetry = {
  machine?: string;
  collectedAt?: string;
  gpu?: unknown;
  cpuProcesses?: unknown[];
  [key: string]: unknown;
};

let latestMachineTelemetry: {
  data: MachineTelemetry;
} | null = null;

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    const escapedCharacters: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return escapedCharacters[character];
  });
}

export function createMachineTelemetryRouter(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const formattedTelemetry = latestMachineTelemetry
      ? JSON.stringify(latestMachineTelemetry, null, 2)
      : "No machine telemetry received yet.";

    res.status(200).type("html").send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Machine telemetry</title>
          <style>
            body { font-family: sans-serif; line-height: 1.4; margin: 2rem; }
            pre { background: #f4f4f4; padding: 1rem; overflow: auto; }
          </style>
        </head>
        <body>
          <h1>Machine telemetry</h1>
          <pre>${escapeHtml(formattedTelemetry)}</pre>
        </body>
      </html>
    `);
  });

  router.post("/machine-data", (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      res.status(400).json({ error: "Request body must be a JSON object" });
      return;
    }

    latestMachineTelemetry = {
      data: req.body as MachineTelemetry,
    };

    res.status(202).json({ received: true });
  });

  return router;
}