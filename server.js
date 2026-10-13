import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BUCKET = "sites";

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.use(helmet({
  // Uploaded HTML is served with a restrictive per-response CSP below.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (![".html", ".htm"].includes(ext)) return cb(new Error("Only .html or .htm files are allowed."));
    cb(null, true);
  }
});

function safeSlug(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeDomain(input) {
  const value = String(input || "").trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253 || value.includes("/") || value.includes(":")) return null;
  // Accept only DNS names, no scheme, path, port, wildcard, or localhost.
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return null;
  if (value === "localhost") return null;
  return value;
}

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Sign in first." });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Session expired. Sign in again." });
    req.user = data.user;
    next();
  } catch {
    res.status(401).json({ error: "Unable to verify session." });
  }
}

function projectUrl(req, slug) {
  const configured = process.env.SITE_BASE_DOMAIN?.trim();
  if (configured) return `https://${slug}.${configured}`;
  return `${req.protocol}://${req.get("host")}/site/${encodeURIComponent(slug)}`;
}

async function sendProjectHtml(project, res) {
  const { data, error } = await supabase.storage.from(BUCKET).download(project.storage_path);
  if (error || !data) return res.status(404).send("Website file not found.");
  const html = Buffer.from(await data.arrayBuffer());
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Important isolation: user-uploaded scripts run in a sandboxed document without same-origin access.
  // This may restrict some advanced websites; remove only after isolating sites on a separate origin.
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups; default-src https: data: blob: 'unsafe-inline' 'unsafe-eval';");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.send(html);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Mobile Hosting API", timestamp: new Date().toISOString() });
});

app.get("/api/config", (_req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: ANON_KEY });
});

// The dashboard is served by this same service.
app.get("/", (_req, res) => res.sendFile(path.join(process.cwd(), "public", "index.html")));

// Resolve mapped custom domains by Host header. A domain must also be attached to the
// hosting service in the hosting provider dashboard and point to it in DNS.
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/site/")) return next();
  const host = normalizeDomain(req.hostname || "");
  if (!host) return next();
  try {
    // Optional wildcard subdomains, e.g. myproject.sites.example.com.
    const siteBase = String(process.env.SITE_BASE_DOMAIN || "").trim().toLowerCase();
    if (siteBase && host.endsWith("." + siteBase)) {
      const subdomainSlug = safeSlug(host.slice(0, -(siteBase.length + 1)));
      if (subdomainSlug) {
        const { data: subProject } = await supabase.from("projects")
          .select("*").eq("slug", subdomainSlug).maybeSingle();
        if (subProject) return sendProjectHtml(subProject, res);
      }
    }
    // Exact custom-domain mapping. The hostname must also be attached to the host service.
    const { data: project } = await supabase.from("projects")
      .select("*").eq("custom_domain", host).maybeSingle();
    if (project) return sendProjectHtml(project, res);
  } catch {}
  next();
});

app.get("/site/:slug", async (req, res) => {
  const slug = safeSlug(req.params.slug);
  if (!slug) return res.status(400).send("Invalid project URL.");
  const { data: project, error } = await supabase.from("projects")
    .select("*").eq("slug", slug).maybeSingle();
  if (error || !project) return res.status(404).send("Project not found.");
  return sendProjectHtml(project, res);
});

app.get("/api/projects", requireUser, async (req, res) => {
  const { data, error } = await supabase.from("projects")
    .select("id,name,slug,storage_path,custom_domain,created_at")
    .eq("user_id", req.user.id).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Could not load projects." });
  res.json({ projects: (data || []).map(p => ({ ...p, url: projectUrl(req, p.slug) })) });
});

app.post("/api/projects", requireUser, upload.single("siteFile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose an HTML file first." });
    const name = String(req.body.name || req.file.originalname).trim().slice(0, 80);
    const slug = safeSlug(req.body.slug || name.replace(/\.(html?|HTML?)$/i, ""));
    if (!name || !slug) return res.status(400).json({ error: "Enter a valid project name." });

    const storagePath = `${req.user.id}/${slug}/index.html`;
    const { error: storageError } = await supabase.storage.from(BUCKET).upload(
      storagePath, req.file.buffer,
      { contentType: "text/html; charset=utf-8", upsert: true }
    );
    if (storageError) return res.status(400).json({ error: `Upload failed: ${storageError.message}` });

    const { data: existing } = await supabase.from("projects").select("id,user_id").eq("slug", slug).maybeSingle();
    if (existing && existing.user_id !== req.user.id) {
      return res.status(409).json({ error: "This project URL is already taken. Choose another slug." });
    }

    let query;
    if (existing) {
      query = await supabase.from("projects").update({ name, storage_path: storagePath })
        .eq("id", existing.id).eq("user_id", req.user.id)
        .select("id,name,slug,storage_path,custom_domain,created_at").single();
    } else {
      query = await supabase.from("projects").insert({
        user_id: req.user.id, name, slug, storage_path: storagePath
      }).select("id,name,slug,storage_path,custom_domain,created_at").single();
    }
    if (query.error) return res.status(400).json({ error: `Project save failed: ${query.error.message}` });
    res.status(201).json({ project: { ...query.data, url: projectUrl(req, slug) } });
  } catch (e) {
    res.status(400).json({ error: e.message || "Upload failed." });
  }
});

app.put("/api/projects/:id", requireUser, async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Project name is required." });
  const { data, error } = await supabase.from("projects").update({ name })
    .eq("id", req.params.id).eq("user_id", req.user.id)
    .select("id,name,slug,custom_domain,created_at").maybeSingle();
  if (error) return res.status(400).json({ error: "Could not rename project." });
  if (!data) return res.status(404).json({ error: "Project not found." });
  res.json({ project: { ...data, url: projectUrl(req, data.slug) } });
});

app.post("/api/projects/:id/domain", requireUser, async (req, res) => {
  const domain = normalizeDomain(req.body.domain);
  if (!domain) return res.status(400).json({ error: "Enter a domain only, e.g. www.example.com (no https:// or path)." });
  const { data, error } = await supabase.from("projects").update({ custom_domain: domain })
    .eq("id", req.params.id).eq("user_id", req.user.id)
    .select("id,name,slug,custom_domain").maybeSingle();
  if (error) return res.status(400).json({ error: "Domain may already be used or could not be saved." });
  if (!data) return res.status(404).json({ error: "Project not found." });
  res.json({
    project: data,
    note: "Domain mapping saved. The domain owner must verify DNS and the hosting administrator must attach this hostname to the web service and enable TLS before it works."
  });
});

app.delete("/api/projects/:id", requireUser, async (req, res) => {
  const { data: project, error: readError } = await supabase.from("projects")
    .select("id,user_id,storage_path").eq("id", req.params.id).eq("user_id", req.user.id).maybeSingle();
  if (readError || !project) return res.status(404).json({ error: "Project not found." });
  await supabase.storage.from(BUCKET).remove([project.storage_path]);
  const { error } = await supabase.from("projects").delete().eq("id", project.id).eq("user_id", req.user.id);
  if (error) return res.status(400).json({ error: "Could not delete project." });
  res.json({ success: true });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "HTML file must be 1 MB or smaller." });
  }
  res.status(400).json({ error: err.message || "Request failed." });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Hosting API listening on ${PORT}`));
