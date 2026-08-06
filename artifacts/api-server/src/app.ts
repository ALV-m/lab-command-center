import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the built frontend (artifacts/lab-control/dist/public) when present.
// The bundle lives in artifacts/api-server/dist, so `../../lab-control/...`
// resolves to artifacts/lab-control/...
const frontendDir = fileURLToPath(
  new URL("../../lab-control/dist/public", import.meta.url),
);
app.use(express.static(frontendDir));

app.use("/api", router);

// SPA fallback: hand every non-API GET request to the frontend.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    next();
    return;
  }

  const indexPath = path.join(frontendDir, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message:
        "Lab Command Center API is running. The dashboard has not been built yet.",
    });
  }
});

export default app;
