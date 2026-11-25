import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { supabase, pool } from "../db.js";
import { buildosFetch, isBuildosConfigured } from "../buildosClient.js";

const router = express.Router();

// Supabase/PostgREST reports transport failures ("fetch failed") through the
// same error channel as validation errors. Those are outages, not bad input,
// so they must not be reported to the client as a 400.
function isUpstreamFailure(error) {
  const message = String(error?.message || "");
  return (
    /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(
      message,
    ) || error?.name === "TypeError"
  );
}

function dbUnavailable(res, error) {
  console.error("Database unavailable", error);
  return res.status(503).json({
    error:
      "The account service is temporarily unavailable. Please try again shortly.",
  });
}

function requireDb(res) {
  if (supabase || pool) return true;
  console.error(
    "No database configured: set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL/PG*",
  );
  res.status(503).json({
    error: "The account service is not configured. Please contact support.",
  });
  return false;
}

/**
 * Vendor-side roles that Procurement raises purchase orders against, and which
 * therefore belong in the BuildOS supplier list.
 *
 * This used to require `role === "supplier"` exactly. The registration form
 * offers a vendor three roles — buyer, supplier and contractor — and *defaults
 * the select to "buyer"*, so a vendor who registered as a contractor, or who
 * simply left the role untouched, was silently never synced. That is why vendor
 * accounts created on SabiQuot did not appear in Procurement.
 *
 * "buyer" stays excluded deliberately: that is a procurement-side account, not
 * somebody being purchased from.
 */
const SUPPLYING_ROLES = new Set(["supplier", "contractor"]);

function isSupplierProfile(profile) {
  return (
    profile?.category === "vendor" &&
    SUPPLYING_ROLES.has(String(profile?.role ?? "").trim().toLowerCase())
  );
}

/**
 * Push a supplier profile to BuildOS Procurement so it appears in the
 * Suppliers list, and persist the resulting link. Covers both fresh
 * registrations and pre-existing accounts that predate this sync (they pick
 * up the link the next time they log in). Never throws — a sync failure must
 * not block registration/login, it's recorded on the profile so it can be
 * retried or surfaced to an admin.
 */
export async function syncSupplierToBuildos(profile, { force = false } = {}) {
  const hasRef = Boolean(String(profile?.buildos_supplier_ref || "").trim());
  const eligible = force || isSupplierProfile(profile) || hasRef;
  if (!isBuildosConfigured() || !eligible || profile.buildos_supplier_id) {
    return profile;
  }

  try {
    const supplier = await buildosFetch("/suppliers/sync-from-portal", {
      method: "POST",
      body: {
        sabiquotProfileId: profile.id,
        name: profile.company || profile.name,
        email: profile.email,
        phone: profile.phone,
        contactPerson: profile.name,
        supplierId: profile.buildos_supplier_ref || undefined,
      },
    });

    if (supabase) {
      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          buildos_supplier_id: supplier.id,
          buildos_sync_status: "linked",
          buildos_sync_error: null,
          buildos_synced_at: new Date().toISOString(),
        })
        .eq("id", profile.id)
        .select()
        .single();
      if (error) {
        console.error("Failed to persist BuildOS supplier link:", error.message);
        return profile;
      }
      return updated;
    }

    if (pool) {
      const { rows } = await pool.query(
        `UPDATE profiles
         SET buildos_supplier_id = $1, buildos_sync_status = 'linked', buildos_sync_error = NULL, buildos_synced_at = NOW()
         WHERE id = $2 RETURNING *`,
        [supplier.id, profile.id],
      );
      return rows[0] || profile;
    }
    return profile;
  } catch (err) {
    console.error("BuildOS supplier sync failed:", err.message);
    if (supabase) {
      await supabase
        .from("profiles")
        .update({ buildos_sync_status: "failed", buildos_sync_error: err.message })
        .eq("id", profile.id)
        .then(null, (updateErr) =>
          console.error("Failed to record BuildOS sync failure:", updateErr.message),
        );
    } else if (pool) {
      await pool
        .query(
          `UPDATE profiles SET buildos_sync_status = 'failed', buildos_sync_error = $1 WHERE id = $2`,
          [err.message, profile.id],
        )
        .catch((updateErr) =>
          console.error("Failed to record BuildOS sync failure:", updateErr.message),
        );
    }
    return profile;
  }
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { name, email, password, phone, role, category, company, buildosSupplierId } =
    req.body;

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ error: "name, email and password are required" });
  }

  if (String(password).length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  if (!requireDb(res)) return;

  const normalizedEmail = String(email).trim();

  try {
    if (supabase) {
      const { data: existing, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (lookupError) {
        if (isUpstreamFailure(lookupError)) return dbUnavailable(res, lookupError);
        console.error("Registration lookup failed", lookupError);
        return res.status(500).json({ error: lookupError.message });
      }

      if (existing) {
        return res
          .status(409)
          .json({ error: "An account with this email already exists" });
      }

      const password_hash = await bcrypt.hash(password, 12);
      const { data, error } = await supabase
        .from("profiles")
        .insert([
          {
            name,
            email: normalizedEmail,
            phone: phone || null,
            role: role || (category === "vendor" ? "buyer" : "public"),
            category: category || "public",
            company: company || null,
            buildos_supplier_ref: String(buildosSupplierId || "").trim() || null,
            password_hash,
          },
        ])
        .select()
        .single();

      if (error) {
        if (isUpstreamFailure(error)) return dbUnavailable(res, error);
        if (error.code === "23505") {
          return res.status(409).json({ error: "An account with this email already exists" });
        }
        console.error("Registration insert failed", error);
        return res.status(400).json({ error: error.message });
      }

      const { password_hash: _ph, ...safe } = data;
      const synced = await syncSupplierToBuildos(safe);
      return res.status(201).json(synced);
    }

    // pg fallback
    const existingPg = await pool.query(
      "SELECT id FROM profiles WHERE email = $1 LIMIT 1",
      [normalizedEmail],
    );
    if (existingPg.rows[0]) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const insertPg = await pool.query(
      `INSERT INTO profiles (name, email, phone, role, category, company, buildos_supplier_ref, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        name,
        normalizedEmail,
        phone || null,
        role || (category === "vendor" ? "buyer" : "public"),
        category || "public",
        company || null,
        String(buildosSupplierId || "").trim() || null,
        password_hash,
      ],
    );
    const { password_hash: _ph, ...safe } = insertPg.rows[0];
    const synced = await syncSupplierToBuildos(safe);
    return res.status(201).json(synced);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    return dbUnavailable(res, error);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  if (!requireDb(res)) return;

  try {
    const normalizedEmail = String(email).trim();
    let data = null;

    if (supabase) {
      const result = await supabase
        .from("profiles")
        .select("*")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (result.error) return dbUnavailable(res, result.error);
      data = result.data;
    } else {
      const result = await pool.query(
        "SELECT * FROM profiles WHERE email = $1 LIMIT 1",
        [normalizedEmail],
      );
      data = result.rows[0] || null;
    }

    if (!data) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!data.password_hash) {
      const { password_hash: _ph, ...safe } = data;
      const synced = await syncSupplierToBuildos(safe);
      return res.json(synced);
    }

    const match = await bcrypt.compare(password, data.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const { password_hash: _ph, ...safe } = data;
    const synced = await syncSupplierToBuildos(safe);
    return res.json(synced);
  } catch (error) {
    return dbUnavailable(res, error);
  }
});

// POST /api/auth/buildos-link  — link profile to a BuildOS user ID
router.post("/buildos-link", async (req, res) => {
  const { profile_id, buildos_user_id } = req.body;

  if (!profile_id || !buildos_user_id) {
    return res
      .status(400)
      .json({ error: "profile_id and buildos_user_id are required" });
  }

  // Best-effort existence check.
  //
  // This used to GET `${BUILDOS_API_URL}/users/:id` unauthenticated. No such
  // route exists — BuildOS serves users from `/admin/users/:id` behind an admin
  // role — so the check returned 404 for every valid id and rejected every link
  // attempt with "BuildOS user ID not found".
  //
  // That endpoint is intentionally NOT opened to service keys: a supplier portal
  // has no business enumerating ERP staff accounts. So an inconclusive check
  // (unreachable, unauthorised, or not found) no longer blocks the link — it is
  // logged and the pairing proceeds, matching how the unreachable case was
  // already handled.
  //
  // Note this links a BuildOS *User*, i.e. an ERP staff login. Pairing a
  // supplier to its BuildOS Supplier record is a separate concern and uses
  // profiles.buildos_supplier_id.
  if (isBuildosConfigured()) {
    try {
      await buildosFetch(`/admin/users/${encodeURIComponent(buildos_user_id)}`);
    } catch (checkErr) {
      console.warn(
        `Could not verify BuildOS user ${buildos_user_id} (${checkErr.message}) — linking anyway`,
      );
    }
  }

  if (supabase) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ buildos_user_id })
      .eq("id", profile_id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const { password_hash: _ph, ...safe } = data;
    return res.json(safe);
  }

  const result = await pool.query(
    "UPDATE profiles SET buildos_user_id = $1 WHERE id = $2 RETURNING *",
    [buildos_user_id, profile_id],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Profile not found" });
  const { password_hash: _ph, ...safe } = result.rows[0];
  return res.json(safe);
});


/**
 * POST /api/auth/change-password — changes a password in place.
 *
 * Backs Settings → Privacy → Change Password, which previously had no handler.
 * Deliberately an in-place change rather than an emailed reset link: there is no
 * reset-token storage or reset page in this app, so a "we've emailed you a link"
 * flow would be a dead end. The current password is required, so possession of
 * an open session is not enough on its own.
 */
router.post("/change-password", async (req, res) => {
  const { profileId, currentPassword, newPassword } = req.body ?? {};

  if (!profileId || !currentPassword || !newPassword) {
    return res.status(400).json({
      error: "profileId, currentPassword and newPassword are required",
    });
  }
  if (String(newPassword).length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters" });
  }

  if (!requireDb(res)) return;

  try {
    let data = null;
    if (supabase) {
      const result = await supabase
        .from("profiles")
        .select("id, password_hash")
        .eq("id", profileId)
        .maybeSingle();
      if (result.error) return dbUnavailable(res, result.error);
      data = result.data;
    } else {
      const result = await pool.query(
        "SELECT id, password_hash FROM profiles WHERE id = $1 LIMIT 1",
        [profileId],
      );
      data = result.rows[0] || null;
    }

    if (!data) return res.status(404).json({ error: "Account not found" });

    if (data.password_hash) {
      const match = await bcrypt.compare(currentPassword, data.password_hash);
      if (!match) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    if (supabase) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ password_hash })
        .eq("id", profileId);
      if (updateError) return dbUnavailable(res, updateError);
    } else {
      await pool.query("UPDATE profiles SET password_hash = $1 WHERE id = $2", [
        password_hash,
        profileId,
      ]);
    }
    return res.json({ changed: true });
  } catch (error) {
    return dbUnavailable(res, error);
  }
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getMailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendPasswordResetEmail(email, name, resetUrl) {
  const mailer = getMailer();
  if (!mailer) {
    console.log(`[password-reset] SMTP not configured. Reset link for ${email}: ${resetUrl}`);
    return;
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || "invoices@yourdomain.com",
    to: email,
    subject: "Reset your Sabiquot password",
    text: `Hi ${name || "there"},\n\nWe received a request to reset your password. Use the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.\n`,
  });
}

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!requireDb(res)) return;

  const generic = {
    message: "If an account exists for that email, a password reset link has been sent.",
  };

  try {
    let profile = null;
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, name")
        .eq("email", email)
        .maybeSingle();
      if (error) {
        if (isUpstreamFailure(error)) return dbUnavailable(res, error);
        console.error("Forgot password lookup failed", error);
        return res.status(500).json({ error: "Could not process request" });
      }
      profile = data;
    } else {
      const result = await pool.query(
        "SELECT id, email, name FROM profiles WHERE email = $1 LIMIT 1",
        [email],
      );
      profile = result.rows[0] || null;
    }

    if (!profile) return res.json(generic);

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    if (supabase) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ reset_token_hash: tokenHash, reset_token_expires_at: expiresAt })
        .eq("id", profile.id);
      if (updateError) {
        if (isUpstreamFailure(updateError)) return dbUnavailable(res, updateError);
        console.error("Forgot password token save failed", updateError);
        return res.status(500).json({ error: "Could not process request" });
      }
    } else {
      await pool.query(
        "UPDATE profiles SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3",
        [tokenHash, expiresAt, profile.id],
      );
    }

    const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const resetUrl = `${appUrl}/?view=reset-password&token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(profile.email, profile.name, resetUrl);

    return res.json(generic);
  } catch (err) {
    if (isUpstreamFailure(err)) return dbUnavailable(res, err);
    console.error("Forgot password failed", err);
    return res.status(500).json({ error: "Could not process request" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!requireDb(res)) return;

  try {
    const tokenHash = sha256(token);
    let profile = null;
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, reset_token_expires_at")
        .eq("reset_token_hash", tokenHash)
        .maybeSingle();
      if (error) {
        if (isUpstreamFailure(error)) return dbUnavailable(res, error);
        console.error("Reset password lookup failed", error);
        return res.status(500).json({ error: "Could not reset password" });
      }
      profile = data;
    } else {
      const result = await pool.query(
        "SELECT id, reset_token_expires_at FROM profiles WHERE reset_token_hash = $1 LIMIT 1",
        [tokenHash],
      );
      profile = result.rows[0] || null;
    }

    if (!profile) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    const expiresAt = profile.reset_token_expires_at ? new Date(profile.reset_token_expires_at).getTime() : 0;
    if (!expiresAt || Date.now() > expiresAt) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    if (supabase) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ password_hash, reset_token_hash: null, reset_token_expires_at: null })
        .eq("id", profile.id);
      if (updateError) {
        if (isUpstreamFailure(updateError)) return dbUnavailable(res, updateError);
        console.error("Reset password update failed", updateError);
        return res.status(500).json({ error: "Could not reset password" });
      }
    } else {
      await pool.query(
        "UPDATE profiles SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $2",
        [password_hash, profile.id],
      );
    }

    return res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    if (isUpstreamFailure(err)) return dbUnavailable(res, err);
    console.error("Reset password failed", err);
    return res.status(500).json({ error: "Could not reset password" });
  }
});

export default router;
