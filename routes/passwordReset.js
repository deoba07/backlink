// routes/passwordReset.js
//
// POST /forgot-password   { email }            -> emails a one-time reset link
// POST /reset-password    { token, password }  -> sets a new password
//
// Mount it in server.js next to your other routes:
//   app.use("/", require("./routes/passwordReset"));

const express = require("express");
const crypto = require("crypto");
const pool = require("../db/db");
const sendEmail = require("../utils/sendEmail");

// Use whichever bcrypt package your register/login routes already use.
let bcrypt;
try {
  bcrypt = require("bcrypt");
} catch {
  bcrypt = require("bcryptjs");
}

const router = express.Router();

const TOKEN_TTL_MINUTES = 30;
const MAX_REQUESTS_PER_HOUR = 3;
const MIN_PASSWORD_LENGTH = 8;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

// Same reply whether or not the email exists, so nobody can use this
// form to find out who has an account.
const GENERIC_REPLY = {
  message: "If an account exists for that email, a reset link has been sent.",
};

/* ---------------- REQUEST A RESET LINK ---------------- */
router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE LOWER(email) = $1",
      [email]
    );

    if (userResult.rowCount > 0) {
      const user = userResult.rows[0];

      // Stop one account being used to flood an inbox.
      const recent = await pool.query(
        `SELECT COUNT(*)::int AS n
         FROM password_reset_tokens
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [user.id]
      );

      if (recent.rows[0].n < MAX_REQUESTS_PER_HOUR) {
        const token = crypto.randomBytes(32).toString("hex");

        // Any older unused link stops working as soon as a new one is issued.
        await pool.query(
          "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
          [user.id]
        );

        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + make_interval(mins => $3::int))`,
          [user.id, hashToken(token), TOKEN_TTL_MINUTES]
        );

        const frontend = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
        const link = `${frontend}/reset-password?token=${token}`;

        await sendEmail({
          to: user.email,
          subject: "Reset your NaijaIntern password",
          text:
            `Hi ${user.name},\n\n` +
            `We received a request to reset your NaijaIntern password. ` +
            `Open this link to choose a new one (it expires in ${TOKEN_TTL_MINUTES} minutes):\n\n` +
            `${link}\n\n` +
            `If you didn't ask for this, you can ignore this email and your password will stay the same.`,
          html:
            `<p>Hi ${user.name},</p>` +
            `<p>We received a request to reset your NaijaIntern password. ` +
            `Click the button below to choose a new one. The link expires in ${TOKEN_TTL_MINUTES} minutes.</p>` +
            `<p><a href="${link}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a></p>` +
            `<p>Or copy this link into your browser:<br>${link}</p>` +
            `<p>If you didn't ask for this, you can ignore this email and your password will stay the same.</p>`,
        });
      }
    }

    return res.json(GENERIC_REPLY);
  } catch (err) {
    // Logged for you in the Render logs. The visitor still gets the generic
    // reply so errors can't be used to probe which emails are registered.
    console.error("forgot-password error:", err);
    return res.json(GENERIC_REPLY);
  }
});

/* ---------------- SET A NEW PASSWORD ---------------- */
router.post("/reset-password", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");

  if (!token) {
    return res.status(400).json({ message: "This reset link is invalid." });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const found = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [hashToken(token)]
    );

    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "This reset link is invalid or has expired. Please request a new one.",
      });
    }

    const { user_id: userId } = found.rows[0];
    const hashed = await bcrypt.hash(password, 10);

    await client.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, userId]);

    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [userId]
    );

    await client.query("COMMIT");

    return res.json({ message: "Password updated. You can now sign in." });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("reset-password error:", err);
    return res.status(500).json({ message: "Something went wrong." });
  } finally {
    client.release();
  }
});

module.exports = router;