# Android থেকে HTML Hosting API Starter (Bangla Guide)

এই প্রজেক্টে আছে:
- Email/password account (Supabase Auth)
- API health endpoint
- HTML/HTM upload (সর্বোচ্চ 1 MB)
- Project list, rename, delete, update একই slug-এ
- Custom domain mapping request
- Supabase database ও Storage
- Render-এ deploy করার উপযোগী Express backend

## আগে জেনে নাও

- ফ্রি Render Web Service idle থাকলে sleep করে; প্রথম request-এ আবার চালু হতে সময় লাগতে পারে।
- Render Free service-এর local filesystem স্থায়ী নয়। তাই এই starter ফাইল Supabase Storage-এ রাখে, SQLite/local uploads ব্যবহার করে না।
- Render-এর Free Postgres database 30 দিন পরে expire হতে পারে; এই starter Supabase database ব্যবহার করে।
- এটি learning/MVP starter, production hosting provider নয়। Custom domain mapping DB-তে save করলেই domain কাজ করবে না: DNS, hosting dashboard-এ hostname attach, SSL এবং ownership verification দরকার।
- Shared host-এ untrusted HTML পরিবেশন ঝুঁকিপূর্ণ। এই starter CSP sandbox দেয়, যা কিছু advanced site-এর functionality সীমিত করতে পারে। বড় পরিসরে চালানোর আগে আলাদা origin, abuse prevention, quotas, logs, backups এবং security review করো।

## ধাপ 1 — Supabase project তৈরি

1. Android Chrome-এ https://supabase.com খুলে account/project তৈরি করো।
2. Project Dashboard > SQL Editor > New query খুলে `schema.sql` ফাইলের সব SQL paste করে Run করো।
3. Storage > New bucket-এ `sites` নামে bucket বানাও। **Public bucket বানানোর দরকার নেই**; private রাখো।
4. Project Settings > API থেকে Project URL, anon/publishable key, এবং service_role/secret key নাও।
5. Service-role key কাউকে পাঠাবে না, HTML ফাইলে বসাবে না এবং GitHub-এ commit করবে না।

## ধাপ 2 — GitHub-এ code upload (Android)

1. GitHub-এ নতুন repository বানাও, যেমন `mobile-hosting-api`।
2. ZIP extract করে ভেতরের ফাইলগুলো repository root-এ upload করো: `server.js`, `package.json`, `schema.sql`, `.env.example`, `public/index.html`, `README-BN.md`।
3. `.env` বা আসল secret key upload করবে না।
4. চাইলে Android-এর Termux-এ Git ব্যবহার করে push করতে পারো; browser upload-ও ব্যবহার করা যায়।

## ধাপ 3 — Render-এ deploy

1. https://render.com-এ sign up করে GitHub connect করো।
2. Dashboard > New + > Web Service > তোমার repository নির্বাচন করো।
3. সেটিংস:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance type: Free (শুরুতে)
4. Environment Variables যোগ করো:
   - `SUPABASE_URL` = Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = secret service role key
   - `SUPABASE_ANON_KEY` = anon/publishable key
   - `NODE_VERSION` = `20` (যদি Render setting-এ প্রয়োজন হয়)
5. Create Web Service চাপো। Deploy শেষ হলে Render URL হবে যেমন `https://your-service.onrender.com`।
6. ব্রাউজারে `https://your-service.onrender.com/api/health` খুলে `{"ok":true,...}` দেখো।
7. মূল URL খুলে panel ব্যবহার করো।

## ধাপ 4 — Supabase Auth

Supabase Dashboard > Authentication > URL Configuration-এ:
- Site URL হিসেবে Render URL দাও।
- Redirect URLs-এ Render URL যোগ করো।
Email confirmation চালু থাকলে signup-এর পরে email confirm করতে হবে। Gmail/Email না পেলে Supabase Auth settings ও spam folder দেখো।

## ধাপ 5 — প্রথম website upload

1. Panel-এ Create account করো; email confirmation লাগলে confirm করো।
2. Sign in করো।
3. ছোট HTML ফাইল বেছে Upload করো।
4. Project link খুলে পরীক্ষা করো। Update করতে একই project name/slug দিয়ে আবার upload করো।

## ধাপ 6 — Custom domain DNS

উদাহরণ: `www.example.com`-কে Render service-এ যুক্ত করা।

1. Render Dashboard > Web Service > Settings > Custom Domains > Add Custom Domain-এ `www.example.com` যোগ করো।
2. Render যে DNS target দেখায় সেটি কপি করো। সাধারণত সাবডোমেইনের জন্য:
   - Type: `CNAME`
   - Name/Host: `www`
   - Target/Value: Render Dashboard-এ দেখানো `your-service.onrender.com`
3. Domain provider-এর DNS-এ একই রেকর্ড বসাও; conflicting `AAAA` record থাকলে Render-এর নির্দেশনা অনুযায়ী সরাও।
4. Render dashboard-এ ফিরে Verify করো এবং TLS/HTTPS active হওয়া পর্যন্ত অপেক্ষা করো।
5. Panel-এর project-এ Add domain ব্যবহার করে `www.example.com` mapping save করো।

**Wildcard subdomain (advanced):** নিজের নিয়ন্ত্রণে থাকা `sites.example.com` ব্যবহার করতে চাইলে Render-এ `*.sites.example.com` custom domain যুক্ত করে Render যে wildcard DNS/CNAME records দেখায় সেগুলো বসাও। Render-এ wildcard certificate validation-এর জন্য অতিরিক্ত records চাইতে পারে—Dashboard-এর exact values-ই ব্যবহার করবে। তারপর Render Environment Variables-এ `SITE_BASE_DOMAIN=sites.example.com` সেট করে redeploy করো। এই মোডে project slug দিয়ে `slug.sites.example.com` URL তৈরি হয়। DNS/Render wildcard setup সফল না হলে URL কাজ করবে না।

**গুরুত্বপূর্ণ:** এই starter custom domain mapping save করে, কিন্তু ব্যবহারকারীর arbitrary domain নিজে থেকে Render service-এ attach করতে পারে না। Render-এ domain attach ও verify করতে hosting account owner-এর কাজ/অনুমতি দরকার। Free tier-এ প্রতি user-এর arbitrary custom domain self-service automate করা যাবে—এমন ধরে নিও না। Root domain (`example.com`) DNS setup provider/Render-এ দেখানো instructions অনুযায়ী আলাদা হতে পারে.

## API endpoints

- `GET /api/health` — API status
- `GET /api/config` — frontend-কে Supabase URL/anon key দেয় (anon key public client key)
- `GET /api/projects` — নিজের projects; Bearer token লাগে
- `POST /api/projects` — multipart upload: `siteFile`, optional `name`; Bearer token লাগে
- `PUT /api/projects/:id` — rename; JSON `{ "name": "New name" }`
- `POST /api/projects/:id/domain` — JSON `{ "domain": "www.example.com" }`
- `DELETE /api/projects/:id` — project delete

## Troubleshooting

- `Missing SUPABASE...`: Render Environment Variables ঠিক করে redeploy করো।
- Signup confirmation issue: Supabase Authentication settings ও email confirmation দেখো।
- `Upload failed`: `sites` bucket তৈরি হয়েছে কি না এবং service role key ঠিক আছে কি না দেখো।
- Project not found: upload সফল হয়েছে কি না এবং একই project slug ব্যবহার করছ কি না দেখো।
- Custom domain pending: DNS propagation, Render Custom Domains verification, TLS status, hostname mapping—সব পরীক্ষা করো।
- API sleep: Render Free service idle হলে প্রথম request ধীর হতে পারে।

## Production-এর আগে

- Custom domain ownership verification (DNS TXT challenge) যোগ করো।
- Arbitrary domains যোগ করতে Render API token backend-এ রাখা এবং permission/limits review করা লাগতে পারে; token কখনও browser-এ রাখবে না।
- Upload limits, malware/abuse monitoring, quotas, audit logs, backups, error reporting ও incident recovery যোগ করো।
- User-uploaded HTML-কে API/admin panel থেকে আলাদা origin-এ রাখো। CSP sandbox কিছু compatibility ভাঙতে পারে, তাই production isolation design review করো।
