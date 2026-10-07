# cornerstonedesigners.com

The website for **Cornerstone Designers**, a fixed-price web design studio in Newberry, South Carolina.
Live at **https://cornerstonedesigners.com**.

Designed and built by Taylor Odom, with AI-assisted development.

## What's in it

- **Hand-written HTML, CSS and JavaScript, no framework.** Every page in `public/` is a static file that Netlify serves as is.
- **Accessibility built in, to WCAG 2.1 AA:** skip links, keyboard-reachable menus and tables, visible focus, `prefers-reduced-motion` support, and light and dark themes that follow the visitor's system setting.
- **A Node.js build script** (`tools/build-blog.mjs`) that turns the Markdown in `content/` into the blog and service pages, and writes the sitemap, RSS feed and schema.org structured data.
- **A Netlify serverless function** (`netlify/functions/submission-created.js`) that runs on every form submission and emails the person who submitted it through the Resend API. New leads get a project questionnaire.
- **Tight security headers** in `netlify.toml`: a Content Security Policy with no third-party scripts, HSTS, and no cookies or trackers.
- **Stripe payment links** for deposits and final payments on `/pay`.

## Layout

```
public/                  the site itself (HTML, CSS, JS, images, video)
content/posts/           blog posts in Markdown
content/services/        service pages in Markdown
tools/build-blog.mjs     builds blog and service pages, sitemap, RSS, structured data
tools/vendor/marked.mjs  Markdown parser (marked, MIT licensed)
netlify/functions/       the form-submission email function
netlify.toml             deploy settings and security headers
```

## Building

Requires Node 18 or newer. No dependencies to install.

```
node tools/build-blog.mjs
```

To run it locally with the function, use the Netlify CLI: `netlify dev`.

## Rights

This code is shared so people can see how the site is built. It isn't licensed for reuse: all rights reserved.
`tools/vendor/marked.mjs` is the MIT-licensed [marked](https://github.com/markedjs/marked) library, © its authors.
