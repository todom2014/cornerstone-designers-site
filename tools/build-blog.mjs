#!/usr/bin/env node
/**
 * Builds the blog and the service pages from content/ into public/.
 *
 *   public/blog/index.html            the list of posts
 *   public/blog/<slug>/index.html     one page per post (content/posts/*.md)
 *   public/services/<slug>/index.html one page per service (content/services/*.md)
 *   public/feed.xml                   RSS
 *   public/sitemap.xml                home, services, blog and every post
 *   public/index.html                 the "From the blog" list, between the
 *                                     blog:latest markers — nothing else touched
 *
 *   node tools/build-blog.mjs
 *
 * No install step: the only dependency is marked, vendored as tools/vendor/marked.mjs (MIT).
 * The output is committed, so Netlify still just serves public/ as it is.
 *
 * A post is a Markdown file with front matter:
 *
 *   ---
 *   title: How much does a website cost in South Carolina?
 *   description: One or two sentences, under 160 characters. The search snippet.
 *   date: 2026-09-26
 *   updated: 2026-10-14        (optional)
 *   category: Pricing
 *   cluster: Small business websites   (optional: links the post to that service page)
 *   keyword: small business website cost south carolina   (for us, not rendered)
 *   slug: website-cost-south-carolina                       (optional)
 *   draft: true                                             (optional, skipped)
 *   ---
 *
 * Posts dated after today are skipped too, so a post can be written ahead.
 *
 * A service page has: title, h1, description, cluster, service_type,
 * price_from (a number, optional), order (for sorting), and slug.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "./vendor/marked.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = join(ROOT, "content", "posts");
const SERVICES_DIR = join(ROOT, "content", "services");
const PUBLIC = join(ROOT, "public");
const SITE = "https://cornerstonedesigners.com";
const AUTHOR = {
  name: "Taylor Odom",
  role: "Founder, owner & web developer",
  bio: "Taylor builds fixed-price websites for small businesses across South Carolina, and remotely for anyone else. Every price on this site is the real price.",
};
const PHONE = { display: "(803) 768-5337", tel: "+18037685337" };

/* ------------------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s) =>
  String(s).toLowerCase().replace(/&#?[a-z0-9]+;/g, "").replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const rfc822 = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString();

function frontMatter(src, file) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

/* Markdown → HTML, with ids on headings so the contents list can link. */
function render(markdown) {
  const headings = [];
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const text = html.replace(/<[^>]+>/g, ""); // still HTML-escaped by marked; insert as-is
        let id = slugify(text) || `section-${headings.length + 1}`;
        while (headings.some((h) => h.id === id)) id += "-2";
        headings.push({ depth, id, text });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
    },
  });
  let html = md.parse(markdown);
  // A table can scroll sideways on a phone, so its wrapper takes keyboard focus
  // and a name (WCAG 2.1.1, axe "scrollable-region-focusable"). The name is the
  // table's column headings.
  let tables = 0;
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, (m, inner) => {
    tables += 1;
    const cols = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
      .map((c) => c[1].replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    const label = (cols.length ? `Table: ${cols.join(", ")}` : `Table ${tables}`).replace(/"/g, "&quot;");
    return `<div class="table-wrap" role="region" tabindex="0" aria-label="${label}"><table>${inner}</table></div>`;
  });
  return { html, headings };
}

const words = (s) => s.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

/* ------------------------------------------------------------------------ */

function loadPosts() {
  if (!existsSync(POSTS_DIR)) return [];
  const now = today();
  return readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, body } = frontMatter(readFileSync(join(POSTS_DIR, f), "utf8"), f);
      for (const k of ["title", "description", "date", "category"]) {
        if (!data[k]) throw new Error(`${f}: front matter needs "${k}"`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error(`${f}: date must be YYYY-MM-DD`);
      const slug = data.slug || f.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
      const { html, headings } = render(body);
      return {
        file: f,
        slug,
        title: data.title,
        description: data.description,
        date: data.date,
        time: /^\d{2}:\d{2}$/.test(data.time || "") ? data.time : "00:00",
        updated: data.updated || data.date,
        category: data.category,
        cluster: data.cluster || "",
        draft: /^(true|yes)$/i.test(data.draft || ""),
        cta: data.cta || "",
        html,
        headings,
        minutes: Math.max(1, Math.round(words(html) / 230)),
        url: `${SITE}/blog/${slug}/`,
      };
    })
    .filter((p) => !p.draft && p.date <= now)
    // Newest first; posts on the same day go by the optional `time:` (HH:MM), then title.
    .sort((a, b) => {
      const ka = a.date + " " + a.time, kb = b.date + " " + b.time;
      return ka < kb ? 1 : ka > kb ? -1 : a.title.localeCompare(b.title);
    });
}

function loadServices() {
  if (!existsSync(SERVICES_DIR)) return [];
  return readdirSync(SERVICES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, body } = frontMatter(readFileSync(join(SERVICES_DIR, f), "utf8"), f);
      for (const k of ["title", "h1", "description", "cluster", "service_type"]) {
        if (!data[k]) throw new Error(`${f}: front matter needs "${k}"`);
      }
      const slug = data.slug || f.replace(/\.md$/, "");
      const { html, headings } = render(body);
      return {
        slug, html, headings,
        title: data.title, h1: data.h1, description: data.description,
        cluster: data.cluster, serviceType: data.service_type,
        priceFrom: data.price_from || "", order: Number(data.order || 99),
        url: `${SITE}/services/${slug}/`,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------------------ */

const TOGGLE = `<button class="theme-toggle" type="button" aria-pressed="false" title="Dark mode">
        <span class="visually-hidden">Dark mode</span>
        <svg class="moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        <svg class="sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      </button>`;

/** `root` is the relative path back to public/, so a post opened straight
 *  from disk still finds its stylesheet. Navigation links are site-absolute. */
function page({ root, title, description, canonical, ogType = "website", extraHead = "", jsonld, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="darkreader-lock">
<script src="${root}theme.js"></script>
<script src="${root}menu.js" defer></script>
<link rel="icon" href="${root}favicon.ico" sizes="any">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" title="Cornerstone Designers blog" href="/feed.xml">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="Cornerstone Designers">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${extraHead}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}blog/blog.css">
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>
</head>
<body>

<a class="skip" href="#main">Skip to content</a>

<header class="masthead">
  <div class="shell">
    <a class="wordmark" href="/">Cornerstone<span>&nbsp;Designers</span></a>
    <nav aria-label="Primary">
      <ul>
        <li><a href="/#services">Services</a></li>
        <li><a href="/#pricing">Pricing</a></li>
        <li><a href="/#work">Work</a></li>
        <li><a href="/#process">Process</a></li>
        <li><a href="/#faq">FAQ</a></li>
        <li><a href="/blog/" aria-current="true">Blog</a></li>
      </ul>
    </nav>
    <div class="head-actions">
      ${TOGGLE}
      <a class="btn btn-ghost" href="/#contact">Start a project</a>
      <details class="menu">
        <summary title="Menu"><span class="visually-hidden">Menu</span><svg class="i-open" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><svg class="i-close" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></summary>
        <nav aria-label="Menu">
          <ul>
            <li><a href="/#services">Services</a></li>
            <li><a href="/#pricing">Pricing</a></li>
            <li><a href="/#work">Work</a></li>
            <li><a href="/#process">Process</a></li>
            <li><a href="/#faq">FAQ</a></li>
            <li><a href="/blog/">Blog</a></li>
            <li><a href="/#contact">Start a project</a></li>
          </ul>
        </nav>
      </details>
    </div>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="colophon">
  <div class="shell">
    <p>&copy; ${new Date().getFullYear()} Cornerstone Designers &nbsp;&middot;&nbsp; Newberry, SC &nbsp;&middot;&nbsp; <a href="tel:${PHONE.tel}">${PHONE.display}</a></p>
    <p>Fixed prices, published &nbsp;&middot;&nbsp; <a href="/#pricing">See pricing</a> &nbsp;&middot;&nbsp; <a href="/feed.xml">RSS</a> &nbsp;&middot;&nbsp; <a href="/pay">Make a payment</a> &nbsp;&middot;&nbsp; <a href="/privacy">Privacy</a></p>
  </div>
</footer>

</body>
</html>
`;
}

const PRICES_LINE = "Starter Site $4,500 &middot; Business Site $8,500 &middot; Custom Build $15,000+";

const ctaInline = `<aside class="cta-inline" aria-label="Our prices">
  <p><strong>Our prices are on the page, not behind a call.</strong></p>
  <p class="prices">${PRICES_LINE}</p>
  <div class="actions"><a class="btn btn-ghost" href="/#pricing">See what&rsquo;s included</a></div>
</aside>
`;

function postPage(post, all, services) {
  // Contents list and a mid-article call to action once a post has four
  // or more sections. "Sources" never counts as a section.
  const h2s = post.headings.filter((h) => h.depth === 2 && !/^sources$/i.test(h.text));
  let content = post.html;
  if (h2s.length >= 4 && post.cta !== "none") {
    const mid = h2s[Math.ceil(h2s.length / 2)];
    if (mid) content = content.replace(`<h2 id="${mid.id}">`, `${ctaInline}<h2 id="${mid.id}">`);
  }
  const toc = h2s.length >= 4
    ? `<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">In this post</h2><ol>${h2s.map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`).join("")}</ol></nav>`
    : "";

  const rank = (p) => (post.cluster && p.cluster === post.cluster ? 2 : 0) + (p.category === post.category ? 1 : 0);
  const related = all.filter((p) => p.slug !== post.slug).sort((a, b) => rank(b) - rank(a)).slice(0, 3);
  const service = services.find((s) => s.cluster === post.cluster);

  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.updated,
        mainEntityOfPage: post.url,
        url: post.url,
        image: `${SITE}/og-image.png`,
        articleSection: post.category,
        wordCount: words(post.html),
        author: { "@type": "Person", name: AUTHOR.name, jobTitle: "Founder, Owner & Web Developer", url: `${SITE}/#team` },
        publisher: { "@id": `${SITE}/#studio`, "@type": "Organization", name: "Cornerstone Designers", logo: { "@type": "ImageObject", url: `${SITE}/apple-touch-icon.png` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog/` },
          { "@type": "ListItem", position: 3, name: post.title, item: post.url },
        ],
      },
    ],
  };

  const body = `<article class="post shell">
  <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/blog/">Blog</a></li><li>${esc(post.category)}</li></ol></nav>

  <header class="post-head">
    <p class="meta">${esc(post.category)} &nbsp;&middot;&nbsp; ${post.minutes} min read</p>
    <h1>${esc(post.title)}</h1>
    <p class="lede">${esc(post.description)}</p>
    <p class="byline">By <strong>${AUTHOR.name}</strong> &nbsp;&middot;&nbsp; <time datetime="${post.date}">${longDate(post.date)}</time>${post.updated !== post.date ? ` &nbsp;&middot;&nbsp; Updated <time datetime="${post.updated}">${longDate(post.updated)}</time>` : ""}</p>
  </header>

  ${toc}

  <div class="prose">
${content}
  </div>

  <div class="post-end">
    <section class="cta-end" aria-labelledby="cta-h">
      <h2 id="cta-h">Want a website with the price printed on the page?</h2>
      <p>${PRICES_LINE}. Written scope, a launch date, and you own everything.</p>
      <div class="actions">
        <a class="btn btn-primary" href="/#contact">Start a project</a>
        <a class="phone" href="tel:${PHONE.tel}">${PHONE.display}</a>
      </div>
    </section>

    ${service ? `<aside class="service-link" aria-label="Related service">
      <p class="meta">Related service</p>
      <a href="/services/${service.slug}/">${esc(service.h1)} &rarr;</a>
    </aside>` : ""}

    <aside class="author" aria-label="About the author">
      <span class="name">${AUTHOR.name}</span>
      <span class="role">${esc(AUTHOR.role)} &nbsp;&middot;&nbsp; Newberry, SC</span>
      <p>${esc(AUTHOR.bio)}</p>
    </aside>
  </div>

  ${related.length ? `<section class="related" aria-labelledby="related-h">
    <h2 id="related-h">Keep reading</h2>
    <ul>${related.map((p) => `<li><p class="meta">${esc(p.category)}</p><a href="/blog/${p.slug}/">${esc(p.title)}</a></li>`).join("")}</ul>
  </section>` : ""}
</article>`;

  return page({
    root: "../../",
    title: `${post.title} | Cornerstone Designers`,
    description: post.description,
    canonical: post.url,
    ogType: "article",
    extraHead: `<meta property="article:published_time" content="${post.date}">\n<meta property="article:modified_time" content="${post.updated}">\n<meta property="article:author" content="${AUTHOR.name}">\n`,
    jsonld,
    body,
  });
}

function servicePage(service, posts) {
  const inCluster = posts.filter((p) => p.cluster === service.cluster).slice(0, 5);
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: service.h1,
        serviceType: service.serviceType,
        description: service.description,
        url: service.url,
        provider: { "@id": `${SITE}/#studio` },
        areaServed: [{ "@type": "State", name: "South Carolina" }, { "@type": "Country", name: "United States" }],
        ...(service.priceFrom ? { offers: { "@type": "Offer", price: String(service.priceFrom), priceCurrency: "USD", url: `${SITE}/#pricing` } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Services", item: `${SITE}/#services` },
          { "@type": "ListItem", position: 3, name: service.h1, item: service.url },
        ],
      },
    ],
  };
  const body = `<article class="post shell">
  <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/#services">Services</a></li><li>${esc(service.h1)}</li></ol></nav>

  <header class="post-head">
    <p class="meta">Service${service.priceFrom ? ` &nbsp;&middot;&nbsp; From $${Number(service.priceFrom).toLocaleString("en-US")}` : ""}</p>
    <h1>${esc(service.h1)}</h1>
    <p class="lede">${esc(service.description)}</p>
    <div class="head-cta"><a class="btn btn-primary" href="/#contact">Start a project</a><a class="btn btn-ghost" href="/#pricing">See all prices</a></div>
  </header>

  <div class="prose">
${service.html}
  </div>

  <div class="post-end">
    <section class="cta-end" aria-labelledby="cta-h">
      <h2 id="cta-h">Get a written, fixed price</h2>
      <p>${PRICES_LINE}. Send the form and you&rsquo;ll get our questions by email, then a price with the scope and a launch date.</p>
      <div class="actions">
        <a class="btn btn-primary" href="/#contact">Start a project</a>
        <a class="phone" href="tel:${PHONE.tel}">${PHONE.display}</a>
      </div>
    </section>
  </div>

  ${inCluster.length ? `<section class="related" aria-labelledby="related-h">
    <h2 id="related-h">From the blog</h2>
    <ul>${inCluster.slice(0, 3).map((p) => `<li><p class="meta">${esc(p.category)}</p><a href="/blog/${p.slug}/">${esc(p.title)}</a></li>`).join("")}</ul>
  </section>` : ""}
</article>`;
  return page({
    root: "../../",
    title: service.title,
    description: service.description,
    canonical: service.url,
    jsonld,
    body,
  });
}

function indexPage(posts) {
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Cornerstone Designers blog",
    url: `${SITE}/blog/`,
    publisher: { "@id": `${SITE}/#studio` },
    blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: p.url, datePublished: p.date })),
  };
  const list = posts.length
    ? `<ol class="posts" reversed>${posts.map((p) => `
    <li>
      <p class="meta"><time datetime="${p.date}">${longDate(p.date)}</time><br>${esc(p.category)} &middot; ${p.minutes} min</p>
      <div>
        <h2><a href="/blog/${p.slug}/">${esc(p.title)}</a></h2>
        <p>${esc(p.description)}</p>
      </div>
    </li>`).join("")}
  </ol>`
    : `<p>The first post is on its way.</p>`;

  return page({
    root: "../",
    title: "Blog: web design, prices and getting found | Cornerstone Designers",
    description: "Plain answers from a South Carolina web studio: what websites cost, what makes one accessible, and what to ask before you hire anyone.",
    canonical: `${SITE}/blog/`,
    jsonld,
    body: `<div class="shell">
  <header class="index-head">
    <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">Blog</li></ol></nav>
    <h1>Plain answers about websites.</h1>
    <p>What things cost, what actually works, and what to ask before you hire anyone &mdash; from a web studio that prints its prices on the page.</p>
    <p class="how-we-write">How these are written: each post is researched and drafted with AI assistance, checked against the sources it links to, and reviewed by Taylor before it goes up.</p>
  </header>
  ${list}
</div>`,
  });
}

function feed(posts) {
  const items = posts.slice(0, 20).map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <category>${esc(p.category)}</category>
      <description>${esc(p.description)}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Cornerstone Designers blog</title>
    <link>${SITE}/blog/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Plain answers about websites, prices and getting found, from a fixed-price web studio in Newberry, SC.</description>
    <language>en-us</language>
${posts[0] ? `    <lastBuildDate>${rfc822(posts[0].updated)}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;
}

function sitemap(posts, services) {
  const newest = posts[0]?.updated;
  const url = (loc, lastmod, freq, pri) =>
    `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ""}    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
    url(`${SITE}/`, newest, "monthly", "1.0"),
    ...services.map((s) => url(s.url, null, "monthly", "0.9")),
    url(`${SITE}/blog/`, newest, "weekly", "0.8"),
    ...posts.map((p) => url(p.url, p.updated, "yearly", "0.7")),
  ].join("\n")}
</urlset>
`;
}

function latestOnHome(posts) {
  const file = join(PUBLIC, "index.html");
  const html = readFileSync(file, "utf8");
  const start = "<!-- blog:latest:start (filled in by tools/build-blog.mjs, don't edit by hand) -->";
  const end = "<!-- blog:latest:end -->";
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < i) throw new Error("public/index.html: blog:latest markers not found");
  const list = posts.slice(0, 3).map((p) => `
        <li>
          <p class="meta">${esc(p.category)} &middot; <time datetime="${p.date}">${longDate(p.date)}</time></p>
          <h3><a href="/blog/${p.slug}/">${esc(p.title)}</a></h3>
          <p>${esc(p.description)}</p>
        </li>`).join("");
  const block = posts.length ? `\n      <ul class="latest">${list}\n      </ul>\n      ` : "\n      ";
  writeFileSync(file, html.slice(0, i + start.length) + block + html.slice(j));
}

/* ------------------------------------------------------------------------ */

const posts = loadPosts();
const services = loadServices();
for (const p of posts) {
  if (p.cluster && !services.some((s) => s.cluster === p.cluster)) {
    console.warn(`  note: ${p.file} has cluster "${p.cluster}" but no service page uses it`);
  }
}
mkdirSync(join(PUBLIC, "blog"), { recursive: true });
for (const post of posts) {
  mkdirSync(join(PUBLIC, "blog", post.slug), { recursive: true });
  writeFileSync(join(PUBLIC, "blog", post.slug, "index.html"), postPage(post, posts, services));
}
for (const service of services) {
  mkdirSync(join(PUBLIC, "services", service.slug), { recursive: true });
  writeFileSync(join(PUBLIC, "services", service.slug, "index.html"), servicePage(service, posts));
}
writeFileSync(join(PUBLIC, "blog", "index.html"), indexPage(posts));
writeFileSync(join(PUBLIC, "feed.xml"), feed(posts));
writeFileSync(join(PUBLIC, "sitemap.xml"), sitemap(posts, services));
latestOnHome(posts);

console.log(`built: ${posts.length} post${posts.length === 1 ? "" : "s"}, ${services.length} service page${services.length === 1 ? "" : "s"}`);
for (const s of services) console.log(`  service  /services/${s.slug}/`);
for (const p of posts) console.log(`  ${p.date}  /blog/${p.slug}/  (${p.minutes} min, ${p.headings.filter((h) => h.depth === 2).length} sections)`);
