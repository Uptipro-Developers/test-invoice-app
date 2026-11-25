import express from "express";
import { supabase, pool } from "../db.js";
import { syncSupplierToBuildos } from "./auth.js";
const router = express.Router();

router.post("/", async (req, res) => {
  const { email, name, company, phone, role } = req.body;
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("profiles")
        .insert([{ email, name, company, phone, role }])
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }
    if (pool) {
      const { rows } = await pool.query(
        `INSERT INTO profiles (email,name,company,phone,role) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [email, name, company || null, phone || null, role || "public"]
      );
      return res.json(rows[0]);
    }
    return res.status(503).json({ error: "Database not configured" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", req.params.id).single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }
    if (pool) {
      const { rows } = await pool.query(`SELECT * FROM profiles WHERE id = $1 LIMIT 1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "Profile not found" });
      const { password_hash: _ph, ...safe } = rows[0];
      return res.json(safe);
    }
    return res.status(503).json({ error: "Database not configured" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const EDITABLE_PROFILE_FIELDS = new Set([
  "name","phone","company","category","role","buildos_supplier_ref","settings",
]);

router.patch("/:id", async (req, res) => {
  const updates = {};
  for (const [key, value] of Object.entries(req.body ?? {})) {
    if (EDITABLE_PROFILE_FIELDS.has(key)) updates[key] = value;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No editable fields supplied" });
  }
  try {
    if (supabase) {
      const { data, error } = await supabase.from("profiles").update(updates).eq("id", req.params.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      const { password_hash: _ph, ...safe } = data;
      return res.json(safe);
    }
    if (pool) {
      const keys = Object.keys(updates);
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const vals = keys.map((k) => k === "settings" ? JSON.stringify(updates[k]) : updates[k]);
      vals.push(req.params.id);
      const { rows } = await pool.query(`UPDATE profiles SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);
      if (!rows[0]) return res.status(404).json({ error: "Profile not found" });
      const { password_hash: _ph, ...safe } = rows[0];
      return res.json(safe);
    }
    return res.status(503).json({ error: "Database not configured" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/profile/:id/stats — aggregate invoice counts by status
router.get("/:id/stats", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from("invoices").select("status").eq("profile_id", req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json(computeStats(data || []));
    }
    if (pool) {
      const { rows } = await pool.query(`SELECT status FROM invoices WHERE profile_id = $1`, [req.params.id]);
      return res.json(computeStats(rows || []));
    }
    return res.json({ invoiceCount: 0, draftCount: 0, pendingCount: 0 });
  } catch (err) {
    console.error("Profile stats failed", err);
    return res.status(500).json({ error: err.message });
  }
});

function computeStats(data) {
  const invoiceCount = data.length;
  const draftCount = data.filter((inv) => inv.status === "draft").length;
  const pendingCount = data.filter((inv) => inv.status === "pending" || inv.status === "quote_submitted").length;
  return { invoiceCount, draftCount, pendingCount };
}

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  try {
    if (supabase) {
      await supabase.from("invoices").delete().eq("profile_id", id);
      await supabase.from("notifications").delete().eq("profile_id", id);
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ deleted: true });
    }
    if (pool) {
      await pool.query(`DELETE FROM invoices WHERE profile_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM notifications WHERE profile_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM profiles WHERE id = $1`, [id]);
      return res.json({ deleted: true });
    }
    return res.status(503).json({ error: "Database not configured" });
  } catch (err) {
    console.error("Account deletion failed", err);
    return res.status(500).json({ error: "Could not delete the account." });
  }
});

// POST /api/profile/:id/buildos-sync — attempt BuildOS supplier sync and return status
router.post("/:id/buildos-sync", async (req, res) => {
  const id = req.params.id;
  const buildosSupplierRef = String(req.body?.buildosSupplierRef || req.body?.buildos_supplier_ref || "").trim();
  try {
    let profile = null;
    if (supabase) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error || !data) return res.status(404).json({ error: "Profile not found" });
      profile = data;
    } else if (pool) {
      const { rows } = await pool.query(`SELECT * FROM profiles WHERE id = $1 LIMIT 1`, [id]);
      profile = rows[0] || null;
      if (!profile) return res.status(404).json({ error: "Profile not found" });
    } else {
      return res.status(503).json({ error: "Database not configured" });
    }

    // If a new ref is provided, persist it first
    if (buildosSupplierRef && buildosSupplierRef !== profile.buildos_supplier_ref) {
      if (supabase) {
        const { data, error } = await supabase.from("profiles").update({ buildos_supplier_ref: buildosSupplierRef }).eq("id", id).select().single();
        if (error) return res.status(400).json({ error: error.message });
        profile = data;
      } else if (pool) {
        const { rows } = await pool.query(`UPDATE profiles SET buildos_supplier_ref = $1 WHERE id = $2 RETURNING *`, [buildosSupplierRef, id]);
        profile = rows[0] || profile;
      }
    }

    const synced = await syncSupplierToBuildos(profile, { force: true });
    const { password_hash: _ph, ...safe } = synced;
    const linked = synced.buildos_sync_status === "linked" || Boolean(synced.buildos_supplier_id);
    const notConfigured = !process.env.BUILDOS_API_URL || !process.env.BUILDOS_SERVICE_API_KEY;
    return res.json({
      ok: linked,
      status: linked ? "linked" : (synced.buildos_sync_status || "not_linked"),
      profile: safe,
      buildosSupplierId: synced.buildos_supplier_id || null,
      buildosSyncError: synced.buildos_sync_error || (linked ? null : (notConfigured ? "BuildOS integration is not configured in this environment." : null)),
    });
  } catch (err) {
    console.error("buildos-sync failed", err);
    return res.status(500).json({ error: err.message || "Sync failed" });
  }
});

export default router;
