import "dotenv/config";

interface SendMailjetOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  textPart: string;
  htmlPart: string;
}

const escapeHtml = (unsafe: string): string =>
  unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const sendMailjetEmail = async ({
  toEmail,
  toName,
  subject,
  textPart,
  htmlPart,
}: SendMailjetOptions): Promise<void> => {
  const apiKey = process.env.MAILJET_API_KEY?.trim();
  const secretKey = process.env.MAILJET_SECRET_KEY?.trim();
  const fromEmail = process.env.EMAIL_FROM?.trim() || "noreply@daurtani.id";
  const fromName =
    process.env.MAIL_FROM_NAME?.replace(/^["']|["']$/g, "").trim() ||
    "DaurTani";

  if (!apiKey || !secretKey) {
    throw new Error(
      "Konfigurasi layanan email Mailjet belum lengkap di server."
    );
  }

  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const payload = {
    Messages: [
      {
        From: {
          Email: fromEmail,
          Name: fromName,
        },
        To: [
          {
            Email: toEmail,
            Name: toName || toEmail.split("@")[0],
          },
        ],
        Subject: subject,
        TextPart: textPart,
        HTMLPart: htmlPart,
      },
    ],
  };

  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("Mailjet API Error:", response.status, errBody);
    throw new Error(
      `Gagal mengirim email melalui Mailjet (HTTP ${response.status})`
    );
  }
};

export const sendActivationMagicLinkEmail = async ({
  toEmail,
  fullName,
  magicLinkUrl,
}: {
  toEmail: string;
  fullName: string;
  magicLinkUrl: string;
}): Promise<void> => {
  const safeName = escapeHtml(fullName || toEmail.split("@")[0]);
  const safeLink = escapeHtml(magicLinkUrl);
  const subject = "Aktivasi Akun DaurTani Anda (Magic Link)";

  const textPart = [
    `Halo ${fullName || toEmail},`,
    "",
    "Terima kasih telah mendaftar di DaurTani.",
    "Silakan klik tautan aktivasi (Magic Link) berikut untuk mengaktifkan akun Anda dan langsung masuk:",
    magicLinkUrl,
    "",
    "Tautan ini berlaku selama 24 jam. Jika Anda tidak merasa mendaftar di DaurTani, abaikan pesan ini.",
    "",
    "Salam hangat,",
    "Tim DaurTani",
  ].join("\n");

  const htmlPart = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9f5ec;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e1e1e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9f5ec;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid rgba(116,167,107,0.35);border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(30,30,30,0.06);">
          <tr>
            <td style="background-color:#74a76b;padding:24px 32px;text-align:left;">
              <span style="font-size:22px;font-weight:700;color:#f9f5ec;letter-spacing:0.4px;">DaurTani</span>
              <p style="margin:4px 0 0 0;font-size:12px;color:#f9f5ec;opacity:0.9;">Ekosistem Sirkular Limbah Pertanian Indonesia</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#1e1e1e;">Aktivasi Akun DaurTani Anda</h1>
              <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#1e1e1e;">
                Halo <strong>${safeName}</strong>,
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#333333;">
                Terima kasih telah bergabung bersama ekosistem DaurTani. Klik tombol di bawah ini untuk memverifikasi alamat email Anda sekaligus masuk secara otomatis melalui <strong>Magic Link</strong>:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#74a76b;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#f9f5ec;text-decoration:none;border-radius:10px;">
                      Aktivasi Akun Sekarang
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#555555;">
                Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke peramban (browser) Anda:
              </p>
              <p style="margin:0 0 24px 0;padding:12px;background-color:#f9f5ec;border-radius:8px;font-size:12px;word-break:break-all;color:#1e1e1e;">
                <a href="${safeLink}" style="color:#74a76b;text-decoration:underline;">${safeLink}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e8e2d5;margin:24px 0;" />
              <p style="margin:0;font-size:12px;line-height:1.5;color:#666666;">
                Tautan aktivasi ini berlaku selama <strong>24 jam</strong>. Apabila Anda tidak merasa mendaftarkan akun di DaurTani, Anda dapat mengabaikan email ini dengan aman.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendMailjetEmail({
    toEmail,
    toName: fullName,
    subject,
    textPart,
    htmlPart,
  });
};

export const sendPasswordResetEmail = async ({
  toEmail,
  fullName,
  resetLinkUrl,
}: {
  toEmail: string;
  fullName: string;
  resetLinkUrl: string;
}): Promise<void> => {
  const safeName = escapeHtml(fullName || toEmail.split("@")[0]);
  const safeLink = escapeHtml(resetLinkUrl);
  const subject = "Atur Ulang Kata Sandi Akun DaurTani Anda";

  const textPart = [
    `Halo ${fullName || toEmail},`,
    "",
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun DaurTani Anda.",
    "Silakan klik tautan berikut untuk membuat kata sandi baru:",
    resetLinkUrl,
    "",
    "Demi keamanan, tautan ini hanya berlaku selama 30 menit dan hanya dapat digunakan satu kali.",
    "Jika Anda tidak merasa meminta pengaturan ulang kata sandi, abaikan pesan ini.",
    "",
    "Salam hangat,",
    "Tim DaurTani",
  ].join("\n");

  const htmlPart = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9f5ec;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e1e1e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9f5ec;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid rgba(116,167,107,0.35);border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(30,30,30,0.06);">
          <tr>
            <td style="background-color:#74a76b;padding:24px 32px;text-align:left;">
              <span style="font-size:22px;font-weight:700;color:#f9f5ec;letter-spacing:0.4px;">DaurTani</span>
              <p style="margin:4px 0 0 0;font-size:12px;color:#f9f5ec;opacity:0.9;">Pemulihan Keamanan Akun</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#1e1e1e;">Atur Ulang Kata Sandi Anda</h1>
              <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#1e1e1e;">
                Halo <strong>${safeName}</strong>,
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#333333;">
                Kami menerima permintaan untuk mengatur ulang kata sandi akun DaurTani yang terhubung dengan alamat email ini. Silakan klik tombol di bawah untuk membuat kata sandi baru:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#74a76b;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#f9f5ec;text-decoration:none;border-radius:10px;">
                      Atur Kata Sandi Baru
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#555555;">
                Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke peramban (browser) Anda:
              </p>
              <p style="margin:0 0 24px 0;padding:12px;background-color:#f9f5ec;border-radius:8px;font-size:12px;word-break:break-all;color:#1e1e1e;">
                <a href="${safeLink}" style="color:#74a76b;text-decoration:underline;">${safeLink}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e8e2d5;margin:24px 0;" />
              <p style="margin:0;font-size:12px;line-height:1.5;color:#666666;">
                Demi keamanan akun Anda, tautan ini hanya berlaku selama <strong>30 menit</strong> dan hanya dapat digunakan satu kali. Apabila Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini—kata sandi akun Anda tidak akan berubah.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendMailjetEmail({
    toEmail,
    toName: fullName,
    subject,
    textPart,
    htmlPart,
  });
};

