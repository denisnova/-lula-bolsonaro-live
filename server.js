const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const { TikTokLiveConnection, WebcastEvent } = require("tiktok-live-connector");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

const username = (process.env.TIKTOK_USERNAME || "")
  .replace(/^@/, "")
  .trim();

const blueGifts = (process.env.BLUE_GIFTS || "Rosa")
  .split(",").map(x => x.trim().toLowerCase());

const redGifts = (process.env.RED_GIFTS || "TikTok")
  .split(",").map(x => x.trim().toLowerCase());

const bluePoints = Number(process.env.BLUE_POINTS || 1);
const redPoints = Number(process.env.RED_POINTS || 1);

let totals = { blue: 0, red: 0 };
let status = {
  connected: false,
  message: "Configure o usuário do TikTok."
};
const clients = new Set();

app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, status, totals });
});

function broadcast(data) {
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  }
}

wss.on("connection", ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "init", totals, status }));
  ws.on("close", () => clients.delete(ws));
});

async function startTikTok() {
  if (!username) {
    console.log("Configure TIKTOK_USERNAME nas variáveis.");
    return;
  }

  try {
    const connection = new TikTokLiveConnection(username, {
      enableExtendedGiftInfo: true
    });

    connection.on(WebcastEvent.GIFT, data => {
      if (data.giftType === 1 && data.repeatEnd !== true) return;

      const name = String(
        data.giftDetails?.giftName ||
        data.extendedGiftInfo?.name || ""
      ).trim().toLowerCase();

      const count = Math.max(1, Number(data.repeatCount || 1));
      let team = null;
      let points = 0;

      if (blueGifts.includes(name)) {
        team = "blue";
        points = bluePoints * count;
      } else if (redGifts.includes(name)) {
        team = "red";
        points = redPoints * count;
      }

      if (!team) return;

      totals[team] += points;

      broadcast({
        type: "gift",
        team,
        giftName: name,
        count,
        points,
        user: data.user?.nickname || "Espectador",
        totals
      });
    });

    connection.on("connected", () => {
      status = {
        connected: true,
        message: "Conectado à live de @" + username
      };
      broadcast({ type: "status", status });
    });

    connection.on("disconnected", () => {
      status = {
        connected: false,
        message: "TikTok desconectado."
      };
      broadcast({ type: "status", status });
    });

    connection.on("error", err => {
      console.error("Erro TikTok:", err?.message || err);
    });

    await connection.connect();
  } catch (err) {
    console.error("Falha TikTok:", err?.message || err);
  }
}

server.listen(PORT, () => {
  console.log("Servidor iniciado na porta", PORT);
  startTikTok();
});
    
