const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5174);
const ROOT = __dirname;
const IS_VERCEL = Boolean(process.env.VERCEL);
const RUNTIME_DIR = IS_VERCEL ? path.join("/tmp", "rentlens") : ROOT;
const DATA_DIR = path.join(RUNTIME_DIR, "data");
const UPLOAD_DIR = path.join(RUNTIME_DIR, "uploads");
const HOMES_FILE = path.join(DATA_DIR, "homes.json");
const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");
const DEMO_OPENID = "demo_openid_for_miniprogram";

loadEnvFile();

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadEnvFile() {
  const envFiles = [path.join(ROOT, ".env"), path.join(ROOT, ".env.deepseek")];
  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 0) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempFile, file);
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-RentLens-User",
  });
  res.end(JSON.stringify(value));
}

function getOpenid(req) {
  const requested = String(req.headers["x-rentlens-user"] || "").trim();
  return (requested || DEMO_OPENID).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || DEMO_OPENID;
}

function userFile(openid, name) {
  return path.join(DATA_DIR, "users", openid, name);
}

function readUserJson(req, name, fallback, legacyFile) {
  const openid = getOpenid(req);
  const file = userFile(openid, name);
  if (!fs.existsSync(file) && openid === DEMO_OPENID && legacyFile && fs.existsSync(legacyFile)) {
    return readJson(legacyFile, fallback);
  }
  return readJson(file, fallback);
}

function writeUserJson(req, name, value) {
  writeJson(userFile(getOpenid(req), name), value);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        settled = true;
        req.destroy();
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on("end", () => {
      if (!settled) resolve(body);
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

const RENTLENS_AI_SKILL = `
你是「RentLens AI 租房看房助手」的核心分析引擎。
你根据房源信息、现场照片说明、录音/分贝数据、文字备注、检测进度和签约提醒状态，帮助租客识别租房风险、补齐现场检查、避免房东套路，并生成清晰可执行的建议。

原则：
1. 不夸大判断。信息不足时使用“疑似”“需要现场确认”“建议复测”。
2. 以租客利益为优先，关注隐藏费用、维修责任、押金退还、噪音、返潮、异味、安全、产权、转租风险。
3. 不凭空编造照片、录音或合同条款中不存在的信息。
4. 输出要可执行，告诉用户发现什么、为什么重要、补查什么、问房东什么。
5. 只输出 JSON，不输出 Markdown。

当 skill=field_inspection 时，输出：
{
  "level": "低风险 | 中风险 | 高风险 | 信息不足",
  "title": "一句话总结当前检测项",
  "findings": ["发现的问题或无法确认的信息"],
  "evidence": ["来自照片、录音、文字备注的依据"],
  "livingImpact": "如果入住，可能带来的居住影响",
  "askLandlord": ["建议追问房东的问题"],
  "missingChecks": ["还需要补拍、复测或现场确认的内容"],
  "nextAction": "用户下一步该做什么",
  "score": 0
}

当 skill=anti_trap_check 时，输出：
{
  "completeness": 0,
  "depositAdvice": "可以考虑支付定金 | 暂不建议支付定金 | 不建议支付定金",
  "trapRisks": [],
  "missingCriticalChecks": [],
  "mustGetInWriting": [],
  "secondVisitSuggestion": [],
  "nextActions": [],
  "summary": "一句话总结当前防坑状态"
}

当 skill=home_analysis 时，输出：
{
  "overallScore": 0,
  "verdict": "优先考虑 | 谨慎考虑 | 暂不建议 | 信息不足",
  "mainRisks": [{"name": "风险名称", "reason": "为什么是风险", "severity": "低 | 中 | 高"}],
  "advantages": [],
  "beforeSigning": [],
  "negotiationPoints": [],
  "depositAdvice": "是否建议现在交定金，以及原因",
  "summary": "给租客的一段最终建议"
}

当 skill=report_writer 时，输出：
{
  "title": "看房报告标题",
  "summary": "报告摘要",
  "riskOverview": [],
  "inspectionSummary": [{"stepName": "检测项", "result": "该项总结", "evidence": "依据", "nextAction": "下一步"}],
  "questionsForLandlord": [],
  "beforeSigningChecklist": [],
  "finalAdvice": "最终建议"
}
`;

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("AI response is not valid JSON");
  }
}

async function callDeepSeek(payload) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error("DEEPSEEK_API_KEY is not configured");
    error.statusCode = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 30000));
  let response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          { role: "system", content: RENTLENS_AI_SKILL },
          { role: "user", content: JSON.stringify(payload) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1800,
      }),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("AI request timed out");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `DeepSeek request failed: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  const content = data.choices?.[0]?.message?.content;
  return extractJson(content);
}

function safeExt(name = "", type = "") {
  const ext = path.extname(name).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
  if (ext) return ext;
  if (type.includes("png")) return ".png";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("webp")) return ".webp";
  if (type.includes("webm")) return ".webm";
  if (type.includes("mpeg")) return ".mp3";
  return ".bin";
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const baseDir = rawPath.startsWith("/uploads/") ? UPLOAD_DIR : ROOT;
  const relativePath = rawPath.startsWith("/uploads/") ? rawPath.replace(/^\/uploads\/?/, "") : rawPath;
  const filePath = path.normalize(path.join(baseDir, relativePath));
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      ext === ".js" ? "text/javascript; charset=utf-8" :
      ext === ".json" ? "application/json; charset=utf-8" :
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".webp" ? "image/webp" :
      ext === ".webm" ? "audio/webm" :
      "application/octet-stream";
    let output = data;
    if (path.basename(filePath) === "index.html") {
      const defaultReq = { headers: { "x-rentlens-user": DEMO_OPENID } };
      const payload = {
        homes: readUserJson(defaultReq, "homes.json", [], HOMES_FILE),
        reminders: readUserJson(defaultReq, "reminders.json", {}, REMINDERS_FILE),
      };
      output = Buffer.from(
        data.toString("utf8").replace(
          '<script src="./api/bootstrap.js?v=20260522-1"></script>',
          `<script>window.__RENTLENS_BOOTSTRAP__ = ${JSON.stringify(payload)};</script>`
        ),
        "utf8"
      );
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(output);
  });
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/homes" && req.method === "GET") {
      sendJson(res, 200, { openid: getOpenid(req), homes: readUserJson(req, "homes.json", [], HOMES_FILE) });
      return;
    }

    if (url.pathname === "/api/homes" && req.method === "PUT") {
      const payload = JSON.parse(await readBody(req) || "{}");
      writeUserJson(req, "homes.json", Array.isArray(payload.homes) ? payload.homes : []);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/reminders" && req.method === "GET") {
      sendJson(res, 200, { openid: getOpenid(req), reminders: readUserJson(req, "reminders.json", {}, REMINDERS_FILE) });
      return;
    }

    if (url.pathname === "/api/bootstrap.js" && req.method === "GET") {
      const payload = {
        homes: readUserJson(req, "homes.json", [], HOMES_FILE),
        reminders: readUserJson(req, "reminders.json", {}, REMINDERS_FILE),
      };
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(`window.__RENTLENS_BOOTSTRAP__ = ${JSON.stringify(payload)};`);
      return;
    }

    if (url.pathname === "/api/reminders" && req.method === "PUT") {
      const payload = JSON.parse(await readBody(req) || "{}");
      writeUserJson(req, "reminders.json", payload.reminders || {});
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/ai/analyze" && req.method === "POST") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const allowedSkills = new Set(["field_inspection", "home_analysis", "anti_trap_check", "report_writer"]);
      if (!allowedSkills.has(payload.skill)) {
        sendJson(res, 400, { error: "Invalid AI skill" });
        return;
      }
      const result = await callDeepSeek(payload);
      sendJson(res, 200, { ok: true, skill: payload.skill, result });
      return;
    }

    if (url.pathname === "/api/files/upload" && req.method === "POST") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const match = String(payload.data || "").match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        sendJson(res, 400, { error: "Invalid file payload" });
        return;
      }
      const type = match[1];
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 12 * 1024 * 1024) {
        sendJson(res, 413, { error: "File is too large" });
        return;
      }
      const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt(payload.name, type)}`;
      const openid = getOpenid(req);
      const userUploadDir = path.join(UPLOAD_DIR, openid);
      fs.mkdirSync(userUploadDir, { recursive: true });
      fs.writeFileSync(path.join(userUploadDir, filename), buffer);
      sendJson(res, 200, {
        url: `/uploads/${openid}/${filename}`,
        name: filename,
        type,
        size: buffer.length,
      });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`RentLens backend running at http://localhost:${PORT}`);
  });
}

module.exports = handleRequest;
