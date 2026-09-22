// scripts/findCompanyEmails.js
//
// Reads every company from your database, visits their website,
// collects any emails it finds, and saves them to company_emails.csv
// so YOU can review them. It does NOT change your database.
//
// Run from your backend folder:   node scripts/findCompanyEmails.js

try {
  require("dotenv").config();
} catch {
  // fine if your db.js already loads it
}

const fs = require("fs");
const pool = require("../db/db");

const PAGES = ["", "/contact", "/contact-us", "/careers", "/about", "/about-us"];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const JUNK_EXT = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i;
const JUNK_DOMAINS = [
  "example.com",
  "sentry.io",
  "wixpress.com",
  "domain.com",
  "email.com",
  "yourdomain.com",
  "yoursite.com",
];

// Earlier in this list = better for an internship application
const PREFERRED = [
  "hr",
  "careers",
  "career",
  "recruitment",
  "jobs",
  "internship",
  "talent",
  "info",
  "contact",
  "hello",
  "enquiries",
  "admin",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeUrl(site) {
  let s = site.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s;
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; InternshipPlatformBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null; // site down, timed out, blocked, bad URL...
  }
}

function extractEmails(html) {
  const found = new Set();
  for (const match of html.match(EMAIL_RE) || []) {
    const email = match.toLowerCase();
    const domain = email.split("@")[1];
    if (JUNK_EXT.test(email)) continue;
    if (JUNK_DOMAINS.includes(domain)) continue;
    found.add(email);
  }
  return [...found];
}

function score(email, siteHost) {
  const [local, domain] = email.split("@");
  let s = 0;
  // Email on the company's own domain is most likely to be right
  if (siteHost && (domain === siteHost || siteHost.endsWith("." + domain) || domain.endsWith(siteHost))) {
    s += 10;
  }
  const idx = PREFERRED.indexOf(local);
  if (idx !== -1) s += 10 - idx * 0.5;
  return s;
}

function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

async function main() {
  const { rows: companies } = await pool.query(
    "SELECT id, name, website FROM companies ORDER BY id"
  );
  console.log(`Found ${companies.length} companies. Starting...\n`);

  const output = [];

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    let status = "";
    let ranked = [];

    if (!c.website || !c.website.trim()) {
      status = "no_website";
    } else {
      try {
        const base = normalizeUrl(c.website);
        const siteHost = new URL(base).hostname.replace(/^www\./, "");

        const pages = await Promise.all(
          PAGES.map((p) => fetchPage(new URL(p, base).href))
        );

        if (pages.every((p) => p === null)) {
          status = "site_unreachable"; // could be a dead or made-up website
        } else {
          const all = new Set();
          for (const html of pages) {
            if (html) extractEmails(html).forEach((e) => all.add(e));
          }
          ranked = [...all].sort((a, b) => score(b, siteHost) - score(a, siteHost));
          status = ranked.length ? "found" : "none_found";
        }
      } catch {
        status = "bad_website_url";
      }
    }

    console.log(`[${i + 1}/${companies.length}] ${c.name}: ${status}${ranked[0] ? " -> " + ranked[0] : ""}`);

    output.push({
      id: c.id,
      name: c.name,
      website: c.website,
      status,
      suggested_email: ranked[0] || "",
      other_candidates: ranked.slice(1, 6).join("; "),
      final_email: "", // <- YOU fill this in while reviewing
    });

    await sleep(500); // be polite to websites
  }

  const header = ["id", "name", "website", "status", "suggested_email", "other_candidates", "final_email"];
  const lines = [header.join(",")];
  for (const row of output) lines.push(header.map((h) => csvCell(row[h])).join(","));

  // The \uFEFF makes Excel open the file with correct characters
  fs.writeFileSync("company_emails.csv", "\uFEFF" + lines.join("\n"), "utf8");

  const count = (s) => output.filter((o) => o.status === s).length;
  console.log("\nDone! Saved to company_emails.csv");
  console.log(`  found emails:      ${count("found")}`);
  console.log(`  none found:        ${count("none_found")}`);
  console.log(`  site unreachable:  ${count("site_unreachable")}`);
  console.log(`  no/bad website:    ${count("no_website") + count("bad_website_url")}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error("Script failed:", err);
  await pool.end();
  process.exit(1);
});