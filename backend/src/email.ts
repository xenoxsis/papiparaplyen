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
