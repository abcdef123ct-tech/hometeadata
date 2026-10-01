import app from "../server.js";

export default function handler(req: any, res: any) {
  if (req && typeof req.url === "string" && !req.url.startsWith("/api")) {
    req.url = req.url.startsWith("/") ? `/api${req.url}` : `/api/${req.url}`;
  }
  return app(req, res);
}

