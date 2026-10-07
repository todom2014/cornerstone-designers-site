/**
 * Netlify event function — fires on every accepted form submission.
 *
 * Emails the PERSON WHO SUBMITTED, not us. Our own copy arrives through
 * Netlify's built-in form notification, configured in the UI.
 *
 * Both forms run through this one file; it branches on `form_name`. Adding a
 * third form means adding one more entry to TEMPLATES.
 *
 * The contact email carries the full project questionnaire. Clients answer by
 * replying, and that reply is what we build the site from.
 *
 * Environment:
 *   RESEND_API_KEY   required — without it we log and do nothing
 *   FROM_EMAIL       optional — defaults below
 *   REPLY_TO_EMAIL   optional — defaults below
 *   SITE_URL         optional — defaults below
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM = process.env.FROM_EMAIL || "Cornerstone Designers <hello@cornerstonedesigners.com>";
const REPLY_TO = process.env.REPLY_TO_EMAIL || "hello@cornerstonedesigners.com";
const SITE = (process.env.SITE_URL || "https://cornerstonedesigners.com").replace(/\/+$/, "");

// The honeypot is a real form field; it must never appear in a receipt.
const HIDDEN_FIELDS = new Set(["form-name", "referral-code", "company-website", "bot-field"]);

/* -------------------------------------------------------------------------
   Helpers
   ---------------------------------------------------------------------- */

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** First name only, and only if it looks like one. Falls back to nothing. */
const greeting = (name) => {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first && first.length <= 40 ? `Hi ${first},` : "Hi,";
};

/** Checkbox groups arrive as arrays; everything else as a string. */
const flatten = (value) => (Array.isArray(value) ? value.join(", ") : String(value ?? "")).trim();

/**
 * Shared HTML shell. Web fonts do not load in most mail clients, so this uses
 * a system stack and leans on the same silver/navy/royal-blue palette as the site.
 *
 * `healthcare` adds the scope line to the footer; `preheader` is the grey
 * preview text most inboxes show beside the subject.
 */
const layout = (bodyHtml, { healthcare = false, preheader = "" } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cornerstone Designers</title></head>
<body style="margin:0;padding:0;background:#E2E6EC;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E2E6EC;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#EEF0F4;border:1px solid #C3C9D3;">
<tr><td style="padding:28px 32px 0 32px;">
<p style="margin:0;font:700 17px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:-.02em;color:#0F1A3D;">
Cornerstone <span style="color:#1E3BB0;">Designers</span></p>
<hr style="border:0;border-top:1px solid #C3C9D3;margin:20px 0 0 0;">
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#363F52;">
${bodyHtml}
</td></tr>
<tr><td style="padding:0 32px 28px 32px;">
<hr style="border:0;border-top:1px solid #C3C9D3;margin:0 0 16px 0;">
<p style="margin:0;font:400 12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#363F52;">
Cornerstone Designers &middot; Newberry, SC<br>
Fixed prices, published &middot; <a href="${SITE}/#pricing" style="color:#1E3BB0;">See pricing</a>${
  healthcare
    ? `<br>Not a HIPAA compliance service &middot; <a href="${SITE}/#scope" style="color:#1E3BB0;">See scope</a>`
    : ""
}
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

const p = (text) =>
  `<p style="margin:0 0 16px 0;">${text}</p>`;

const h = (text) =>
  `<p style="margin:24px 0 12px 0;font:400 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#1E3BB0;">${text}</p>`;

const button = (href, label) =>
  `<p style="margin:0 0 24px 0;"><a href="${href}" style="display:inline-block;background:#1E3BB0;color:#EEF0F4;text-decoration:none;padding:13px 22px;font:400 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;">${label}</a></p>`;

/* -------------------------------------------------------------------------
   The questionnaire
   ---------------------------------------------------------------------- */

/**
 * Everything we need to know to build the site a client is picturing, asked
 * once, up front, in the contact email. The client answers by replying.
 *
 * public/intake.html asks the same questions in the same order for anyone who
 * would rather use a form. Change a question here and change it there too.
 *
 * `essential: true` marks the questions that matter most. The email tells
 * anyone short on time to answer just those.
 */
const CORE_SECTIONS = [
  {
    title: "Your business",
    questions: [
      { essential: true, q: "What's the business called, exactly as it should appear on the site?" },
      { essential: true, q: "In a sentence or two, what do you do?" },
      { essential: true, q: "Where are you based, and what area do you serve? (Or are you online only?)" },
      { essential: true, q: "Who are your best customers? Who is this website really for?" },
      { q: "Why do customers choose you over the competition?" },
      { q: "Do you have a website now? If so, what's the address, and what do you want to change about it?" },
    ],
  },
  {
    title: "What the site has to do",
    questions: [
      { essential: true, q: "When someone lands on your site, what's the one thing you most want them to do? Call, book, buy, request a quote, visit, sign up, donate?" },
      { q: "What else should it do for you? Show your work, answer common questions, cut down phone calls, help you hire, get you found on Google?" },
      { q: "What would a customer type into Google to find a business like yours?" },
      { q: "Is there a date you need it live by, and what's driving it? A launch, an event, a busy season?" },
    ],
  },
  {
    title: "Pages and content",
    questions: [
      { essential: true, q: "Which pages do you want? List them, or pick from: Home, About, Services (one page, or one per service), Shop, Pricing, Menu, Gallery or Portfolio, Team, Reviews, FAQ, Blog, Events, Careers, Locations, Contact." },
      { essential: true, q: "List your services or products, with prices if you want prices shown." },
      { q: "Who's writing the words: you, reuse what's on your current site, or would you like help?" },
      { q: "Any reviews or testimonials to feature? Paste them in, or tell us where they live (Google, Facebook, Yelp)." },
      { q: "Should anyone on your team be on the site? Names and roles." },
    ],
  },
  {
    title: "Features",
    questions: [
      { essential: true, q: "Which of these do you need? Contact form, quote request, online booking, online store or payments, newsletter sign-up, blog, events calendar, photo gallery, map and directions, customer login, more than one language, something else?" },
      { q: "Any tools the site should connect to? Square, Shopify, Calendly, Mailchimp, Google Calendar, a booking system, a CRM?" },
    ],
  },
  {
    title: "Look and feel",
    questions: [
      { essential: true, q: "Do you have a logo? If so, do you have the original files, or only a small image?" },
      { q: "Any brand colors or fonts? Hex codes if you have them. \"The blue on our trucks\" works too." },
      { essential: true, q: "Name two or three websites you like, from any industry, and what you like about each one." },
      { q: "Anything you don't want? Sites, colors or styles to steer clear of." },
      { q: "Three words for how the site should feel. For example: warm, modern, premium, playful, trustworthy, bold." },
      { q: "Photos: do you have professional photos, phone photos, or none yet?" },
    ],
  },
  {
    title: "The practical details",
    questions: [
      { essential: true, q: "What contact details should the site show? Phone, email, address (or service area only), and opening hours." },
      { q: "Which social media accounts should we link to?" },
      { q: "Who has your domain name and hosting right now? \"No idea\" is a fine answer. Please don't send passwords." },
      { q: "Who makes the final call on the site, and who should we talk to day to day?" },
      { q: "Which package looks closest: Starter Site ($4,500), Business Site ($8,500), Custom Build ($15,000+), or not sure yet?" },
    ],
  },
];

/** Always last, after any sections added below. */
const FINAL_SECTION = {
  title: "Anything else",
  questions: [
    { q: "Anything else we should know? Must-haves, pet peeves, things your last web designer got wrong. It all helps." },
  ],
};

const isHealthcare = (data) => /medical|dental|healthcare/i.test(flatten(data.business_type));

const wantsStore = (data) =>
  /store|retail|e-?commerce|shop/i.test(`${flatten(data.business_type)} ${flatten(data.site_type)}`);

// Healthcare practices get their own scheduling question, so they skip this.
const wantsBooking = (data) =>
  !isHealthcare(data) &&
  (/booking|appointment/i.test(flatten(data.site_type)) || /salon|spa|fitness/i.test(flatten(data.business_type)));

/** Sections added only when the contact form says they apply. */
const EXTRA_SECTIONS = [
  {
    when: isHealthcare,
    title: "For healthcare practices",
    questions: [
      { q: "Which providers should be on the site? Names, credentials and specialties." },
      { q: "Which insurance plans do you accept, and what should new patients know before their first visit?" },
      { q: "Is there a patient portal, scheduling system or EHR the site should link to? Vendor names only, please. We link to those systems; we never build anything that stores patient records." },
    ],
  },
  {
    when: wantsStore,
    title: "For your online store",
    questions: [
      { q: "Roughly how many products, and do they come in options like sizes or colors?" },
      { q: "Are they physical products, digital downloads or services? How do you ship or deliver them, and where to?" },
      { q: "Are you already selling somewhere, like Shopify, Square, Etsy or Amazon, that we should build from or move off?" },
    ],
  },
  {
    when: wantsBooking,
    title: "For online booking",
    questions: [
      { q: "What can people book? How long does each appointment take, and what does each one cost?" },
      { q: "Do you already use a booking system? If so, which one?" },
      { q: "Should customers pay, or leave a deposit, when they book?" },
    ],
  },
];

/** The sections this person gets, numbered continuously so replies can say "7." */
function questionnaire(data) {
  let n = 0;
  return [...CORE_SECTIONS, ...EXTRA_SECTIONS.filter((s) => s.when(data)), FINAL_SECTION].map((s) => ({
    title: s.title,
    questions: s.questions.map((x) => ({ ...x, n: ++n })),
  }));
}

const PRICES = [
  ["Starter Site", "$4,500", "1-2 weeks", "1&ndash;2 wks"],
  ["Business Site", "$8,500", "3-4 weeks", "3&ndash;4 wks"],
  ["Custom Build", "$15,000+", "6-8 weeks", "6&ndash;8 wks"],
];

const PHI_TEXT =
  "One thing worth saying plainly: please don't send us anything from a patient record. We don't handle protected health information, and email isn't a secure channel for it.";
const PHI_HTML = `<span style="color:#98432F;">One thing worth saying plainly:</span> please don&rsquo;t send us anything from a patient record. We don&rsquo;t handle protected health information, and email isn&rsquo;t a secure channel for it.`;

const SIGN_OFF_TEXT = ["Taylor Odom", "Cornerstone Designers", SITE].join("\n");
const SIGN_OFF_HTML = p("Taylor Odom<br><span style=\"color:#0F1A3D;\">Cornerstone Designers</span>");

/* -------------------------------------------------------------------------
   Templates
   ---------------------------------------------------------------------- */

/**
 * Contact form → the full questionnaire, answered by reply.
 *
 * The reply lands in our inbox as one email with everything we need to write
 * a fixed price and build the site the client described.
 */
function contactEmail(data) {
  const hi = greeting(data.name);
  const business = flatten(data.business) || flatten(data.practice);
  const healthcare = isHealthcare(data);
  const sections = questionnaire(data);

  const thanksText = business
    ? `Thanks for getting in touch about ${business}. This is a real reply from a real person — we've read what you sent.`
    : "Thanks for getting in touch. This is a real reply from a real person — we've read what you sent.";
  const thanksHtml = business
    ? `Thanks for getting in touch about <strong style="color:#0F1A3D;">${esc(business)}</strong>. This is a real reply from a real person &mdash; we&rsquo;ve read what you sent.`
    : "Thanks for getting in touch. This is a real reply from a real person &mdash; we&rsquo;ve read what you sent.";

  const text = [
    hi,
    thanksText,
    "Before we price anything, we want to know exactly what you're picturing, so the site we build is the one you wanted and not our guess at it. The questions below cover everything we'd otherwise ask on a call.",
    [
      "HOW TO ANSWER",
      "",
      "Hit reply and answer however is easiest: type under each question, or just number your answers to match. Bullet points and half-sentences are fine. Skip anything that doesn't apply, and \"not sure\" is a useful answer.",
      "",
      "Short on time? Answer the ★ questions and we'll ask about the rest later.",
      "",
      `Rather use a form? Same questions: ${SITE}/intake`,
    ].join("\n"),
    ...sections.map((s) =>
      [s.title.toUpperCase(), "", ...s.questions.map((x) => `${x.n}. ${x.essential ? "★ " : ""}${x.q}\n`)].join("\n").trimEnd()
    ),
    [
      "WHAT HAPPENS NEXT",
      "",
      "Once your answers are in, you'll have a written fixed price, with the scope beside it and a launch date rather than a range, usually within two working days. Nothing is owed and there's no obligation.",
      "",
      "Rather talk it through? Reply and say so, and we'll call you.",
    ].join("\n"),
    ["THE PRICES, AGAIN", "", ...PRICES.map(([name, price, time]) => `  ${name.padEnd(15)} ${price.padEnd(9)} ${time}`)].join("\n"),
    healthcare ? PHI_TEXT : null,
    SIGN_OFF_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");

  const questionRows = (s) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 8px 0;">` +
    s.questions
      .map(
        (x) =>
          `<tr>
             <td style="padding:10px 12px 10px 0;border-bottom:1px solid #C3C9D3;vertical-align:top;width:28px;font:400 12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#1E3BB0;">${String(x.n).padStart(2, "0")}</td>
             <td style="padding:10px 0;border-bottom:1px solid #C3C9D3;vertical-align:top;color:#0F1A3D;">${x.essential ? `<span style="color:#1E3BB0;" aria-label="Essential">&#9733;</span> ` : ""}${esc(x.q)}</td>
           </tr>`
      )
      .join("") +
    `</table>`;

  const html = layout(
    p(esc(hi)) +
      p(thanksHtml) +
      p(
        "Before we price anything, we want to know exactly what you&rsquo;re picturing, so the site we build is the one you wanted and not our guess at it. The questions below cover everything we&rsquo;d otherwise ask on a call."
      ) +
      h("How to answer") +
      p(
        "<strong style=\"color:#0F1A3D;\">Hit reply</strong> and answer however is easiest: type under each question, or just number your answers to match. Bullet points and half-sentences are fine. Skip anything that doesn&rsquo;t apply, and &ldquo;not sure&rdquo; is a useful answer."
      ) +
      p(
        "Short on time? Answer the <span style=\"color:#1E3BB0;\">&#9733;</span> questions and we&rsquo;ll ask about the rest later."
      ) +
      p("Rather use a form? It&rsquo;s the same questions:") +
      button(`${SITE}/intake`, "Answer on the form") +
      sections.map((s) => h(esc(s.title)) + questionRows(s)).join("") +
      h("What happens next") +
      p(
        "Once your answers are in, you&rsquo;ll have a written fixed price, with the scope beside it and a launch date rather than a range, usually within two working days. Nothing is owed and there&rsquo;s no obligation."
      ) +
      p("Rather talk it through? Reply and say so, and we&rsquo;ll call you.") +
      h("The prices, again") +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px 0;font:400 13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#0F1A3D;">` +
      PRICES.map(
        ([name, price, , timeHtml], i) =>
          `<tr><td style="padding:9px 0;${i < PRICES.length - 1 ? "border-bottom:1px solid #C3C9D3;" : ""}">${name}</td><td align="right" style="padding:9px 0;${i < PRICES.length - 1 ? "border-bottom:1px solid #C3C9D3;" : ""}">${price} &middot; ${timeHtml}</td></tr>`
      ).join("") +
      `</table>` +
      (healthcare ? p(PHI_HTML) : "") +
      SIGN_OFF_HTML,
    {
      healthcare,
      preheader: "Hit reply and answer in your own words. A written fixed price follows within two working days.",
    }
  );

  return { subject: "Your website questions — just hit reply", text, html };
}

/** Intake form → a receipt, so they have a record of what they told us. */
function intakeEmail(data, payload) {
  const hi = greeting(data.name);
  const healthcare = isHealthcare(data);

  // ordered_human_fields keeps the on-page order and the human labels.
  const answers = (payload.ordered_human_fields || [])
    .filter((f) => !HIDDEN_FIELDS.has(f.name) && flatten(f.value))
    .map((f) => ({ label: f.title || f.name, value: flatten(f.value) }));

  // Built as blocks joined by a blank line, so an omitted section can never
  // leave a stray gap or run two paragraphs together.
  const text = [
    hi,
    "Thanks. That's everything we need to price your site and build it the way you described.",
    [
      "What happens next:",
      "",
      "1. We read it properly. A person, not a scoring form. If your answers change what we'd recommend, we'll say so rather than quietly quoting the tier you ticked.",
      "2. We may ask one or two follow-ups, in writing, so you can answer when it suits you.",
      "3. You get a written fixed price, usually within two working days, with the scope beside it and a launch date rather than a range.",
    ].join("\n"),
    "Nothing is owed and there's no obligation to go ahead.",
    answers.length
      ? ["For your records, here's what you sent us:", "", ...answers.map((a) => `  ${a.label}: ${a.value}`)].join("\n")
      : null,
    "Remembered something? Just reply to this email. It comes straight to our inbox, and there's no need to fill the form in again.",
    healthcare
      ? "And please don't send anything from a patient record. We don't handle protected health information and email isn't a secure channel for it."
      : null,
    SIGN_OFF_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");

  const answersHtml = answers.length
    ? h("For your records") +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px 0;">` +
      answers
        .map(
          (a) =>
            `<tr>
               <td style="padding:10px 12px 10px 0;border-bottom:1px solid #C3C9D3;vertical-align:top;width:40%;font:400 11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#363F52;">${esc(a.label)}</td>
               <td style="padding:10px 0;border-bottom:1px solid #C3C9D3;vertical-align:top;font:400 14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F1A3D;">${esc(a.value)}</td>
             </tr>`
        )
        .join("") +
      `</table>`
    : "";

  const html = layout(
    p(esc(hi)) +
      p("Thanks. That&rsquo;s everything we need to price your site and build it the way you described.") +
      h("What happens next") +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px 0;">
        <tr><td style="padding:0 12px 14px 0;vertical-align:top;font:400 12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#1E3BB0;">01</td>
            <td style="padding:0 0 14px 0;vertical-align:top;"><strong style="color:#0F1A3D;">We read it properly.</strong> A person, not a scoring form. If your answers change what we&rsquo;d recommend, we&rsquo;ll say so rather than quietly quoting the tier you ticked.</td></tr>
        <tr><td style="padding:0 12px 14px 0;vertical-align:top;font:400 12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#1E3BB0;">02</td>
            <td style="padding:0 0 14px 0;vertical-align:top;"><strong style="color:#0F1A3D;">We may ask one or two follow-ups.</strong> In writing, so you can answer when it suits you.</td></tr>
        <tr><td style="padding:0 12px 0 0;vertical-align:top;font:400 12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#1E3BB0;">03</td>
            <td style="padding:0;vertical-align:top;"><strong style="color:#0F1A3D;">A written fixed price.</strong> Usually within two working days, with the scope beside it and a launch date rather than a range.</td></tr>
      </table>` +
      p("Nothing is owed and there&rsquo;s no obligation to go ahead.") +
      answersHtml +
      p(
        "Remembered something? Just reply to this email. It comes straight to our inbox, and there&rsquo;s no need to fill the form in again."
      ) +
      (healthcare
        ? p(
            `<span style="color:#98432F;">And please don&rsquo;t send anything from a patient record.</span> We don&rsquo;t handle protected health information, and email isn&rsquo;t a secure channel for it.`
          )
        : "") +
      SIGN_OFF_HTML,
    { healthcare }
  );

  return { subject: "We've got your answers — here's what happens next", text, html };
}

const TEMPLATES = {
  contact: contactEmail,
  "project-intake": intakeEmail,
  // The form's name before the rebrand. Kept so a stale cached page still
  // gets a receipt; safe to delete once nothing submits under it.
  "practice-intake": intakeEmail,
};

/* -------------------------------------------------------------------------
   Handler
   ---------------------------------------------------------------------- */

/**
 * Always 200.
 *
 * A non-2xx response makes Netlify retry the event, and a retry means someone
 * receives the same email twice. A failed send is logged and dropped instead —
 * check Functions → submission-created in Netlify when one doesn't arrive.
 */
const ok = (note) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ok: true, note: note || "handled" }),
});

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || "{}").payload;
  } catch (err) {
    console.error("submission-created: could not parse body —", err.message);
    return ok("unparseable body");
  }

  if (!payload || !payload.form_name) {
    console.error("submission-created: no payload or form_name on the event");
    return ok("no payload");
  }

  const formName = payload.form_name;
  const data = payload.data || {};
  const to = String(data.email || "").trim();

  const build = TEMPLATES[formName];
  if (!build) {
    console.log(`submission-created: no template for form "${formName}" — nothing to send`);
    return ok("no template");
  }

  if (!to) {
    console.warn(`submission-created: "${formName}" submission ${payload.id} had no email address`);
    return ok("no recipient");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("submission-created: RESEND_API_KEY is not set — no email sent");
    return ok("no api key");
  }

  const message = build(data, payload);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "(no body)");
      console.error(
        `submission-created: Resend rejected the "${formName}" email — ${response.status} ${detail}`
      );
      return ok("send rejected");
    }

    const result = await response.json().catch(() => ({}));
    console.log(`submission-created: sent "${formName}" email to ${to} (resend id ${result.id || "unknown"})`);
    return ok("sent");
  } catch (err) {
    console.error(`submission-created: send threw for "${formName}" —`, err.message);
    return ok("send failed");
  }
};

// Exported for testing without invoking the handler.
module.exports.contactEmail = contactEmail;
module.exports.intakeEmail = intakeEmail;
module.exports.questionnaire = questionnaire;
