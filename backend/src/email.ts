// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const nodemailer: any = require("nodemailer");

const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM ?? "paraplyen@mdbeads.com";
const EMAIL_FROM_NAME = "Pap i Paraplyen";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "mail.mdbeads.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true, // SSL/TLS
    auth: {
      user: process.env.SMTP_USER ?? EMAIL_FROM_ADDRESS,
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
): Promise<void> {
  if (!process.env.SMTP_PASS) {
    console.warn("[email] SMTP_PASS not set — skipping send");
    return;
  }

  const transporter = createTransport();
  await transporter.sendMail({
    from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html: htmlContent,
  });
}

export function resetPasswordEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a">Nulstil din adgangskode</h2>
      <p style="color:#555">Du har anmodet om at nulstille din adgangskode til Pap i Paraplyen.</p>
      <p style="color:#555">Klik på knappen herunder — linket er gyldigt i <strong>1 time</strong>.</p>
      <a href="${resetUrl}"
         style="display:inline-block;margin:16px 0;padding:12px 24px;background:#e63946;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        Nulstil adgangskode
      </a>
      <p style="color:#999;font-size:12px">Hvis du ikke bad om dette, kan du ignorere denne e-mail.</p>
    </div>
  `;
}

export function oauthAccountEmailHtml(provider: string): string {
  const providerName =
    provider === "google"
      ? "Google"
      : provider === "facebook"
        ? "Facebook"
        : provider;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a">Adgangskode nulstilling</h2>
      <p style="color:#555">Din konto bruger <strong>${providerName}</strong> login og har ingen adgangskode.</p>
      <p style="color:#555">Log ind via ${providerName}-knappen på login-siden.</p>
      <p style="color:#999;font-size:12px">Hvis du ikke bad om dette, kan du ignorere denne e-mail.</p>
    </div>
  `;
}

// ── Schedule email helpers ───────────────────────────────────────────────────

export type NightSummary = {
  name: string;
  date: string; // YYYY-MM-DD
  time_from: string;
  time_to: string;
  location: string;
};

function formatDanishDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const months = [
    "januar",
    "februar",
    "marts",
    "april",
    "maj",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "december",
  ];
  return `${Number(day)}. ${months[Number(month) - 1]} ${year}`;
}

/**
 * Digest email sent to all Vagter/Admins when one or more new club nights are
 * added. Sent once after a debounce window so multiple nights batch together.
 */
export function newNightsDigestEmailHtml(
  nights: NightSummary[],
  recipientName?: string,
): string {
  const greeting = recipientName ? `Hej ${recipientName},` : "Hej,";
  const intro =
    nights.length === 1
      ? `Der er tilføjet en ny klubaften til vagtplanen.`
      : `Der er tilføjet ${nights.length} nye klubaftener til vagtplanen.`;

  const rows = nights
    .map(
      (n, i) => `
      <tr style="background:${i % 2 === 0 ? "#fff" : "#fafafa"}">
        <td style="padding:8px 12px;font-weight:600;color:#1a1a1a;white-space:nowrap">${formatDanishDate(n.date)}</td>
        <td style="padding:8px 12px;color:#555">${n.name}</td>
        <td style="padding:8px 12px;color:#555;white-space:nowrap">${n.time_from}–${n.time_to}</td>
        <td style="padding:8px 12px;color:#555">${n.location}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a;margin-bottom:4px">Ny klubaften${nights.length !== 1 ? "er" : ""} tilføjet</h2>
      <p style="color:#555">${greeting}</p>
      <p style="color:#555">${intro}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 12px;text-align:left;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Dato</th>
            <th style="padding:8px 12px;text-align:left;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Navn</th>
            <th style="padding:8px 12px;text-align:left;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Tid</th>
            <th style="padding:8px 12px;text-align:left;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Sted</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <a href="${process.env.FRONTEND_URL ?? "http://localhost:3000"}/member/schedule"
         style="display:inline-block;margin:8px 0 16px;padding:10px 20px;background:#e63946;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
        Se vagtplan
      </a>
      <p style="color:#999;font-size:12px">Du modtager denne e-mail fordi du er tilknyttet Pap i Paraplyen som vagt.</p>
    </div>
  `;
}

/** Email sent to a member when they are @mentioned in a channel message. */
export function mentionEmailHtml(
  recipientName: string,
  senderName: string,
  channelName: string,
  messageBody: string,
): string {
  // Strip mention syntax for display
  const plainBody = messageBody.replace(/@\[([^\]]+)\]\(\d+\)/g, "@$1");
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a;margin-bottom:4px">Du blev n&#230;vnt</h2>
      <p style="color:#555">Hej ${recipientName},</p>
      <p style="color:#555"><strong>${senderName}</strong> n&#230;vnte dig i <strong>${channelName}</strong>:</p>
      <div style="margin:16px 0;padding:14px 16px;background:#f9f9f9;border-radius:8px;border-left:4px solid #6366f1;font-size:14px;color:#333">
        ${plainBody}
      </div>
      <a href="${process.env.FRONTEND_URL ?? "http://localhost:3000"}/member/profile"
         style="display:inline-block;margin:8px 0 16px;padding:10px 20px;background:#e63946;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
        Se besked
      </a>
      <p style="color:#999;font-size:12px">Du kan sl&#229; disse e-mails fra under Rediger profil &#8594; E-mails.</p>
    </div>
  `;
}

/** Email sent immediately when a member is assigned to a shift. */
export function shiftAssignedEmailHtml(
  memberName: string,
  night: NightSummary,
): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a;margin-bottom:4px">Du er tildelt en vagt</h2>
      <p style="color:#555">Hej ${memberName},</p>
      <p style="color:#555">Du er blevet tildelt følgende vagt og skal bekræfte din deltagelse:</p>
      <div style="margin:16px 0;padding:16px;background:#f9f9f9;border-radius:8px;border-left:4px solid #e63946;font-size:14px">
        <p style="margin:0 0 6px;font-weight:700;font-size:16px;color:#1a1a1a">${night.name}</p>
        <p style="margin:0 0 4px;color:#555">📅 ${formatDanishDate(night.date)}</p>
        <p style="margin:0 0 4px;color:#555">🕐 ${night.time_from}–${night.time_to}</p>
        <p style="margin:0;color:#555">📍 ${night.location}</p>
      </div>
      <a href="${process.env.FRONTEND_URL ?? "http://localhost:3000"}/member/schedule"
         style="display:inline-block;margin:8px 0 16px;padding:10px 20px;background:#e63946;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
        Bekræft vagt
      </a>
      <p style="color:#999;font-size:12px">Du modtager denne e-mail fordi du er tilknyttet Pap i Paraplyen som vagt.</p>
    </div>
  `;
}
