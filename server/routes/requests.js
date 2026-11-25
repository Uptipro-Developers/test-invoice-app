import express from "express";
import { supabase, pool, saveInvoice } from "../db.js";
import { buildosFetch, isBuildosConfigured } from "../buildosClient.js";

const router = express.Router();

async function pgQueryRequests(profileId) {
  if (!pool) return [];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM requests WHERE profile_id = $1 ORDER BY created_at DESC`,
      [profileId]
    );
    return rows;
  } catch (err) {
    // table may not exist in local pg mode
    if (err.code === "42P01") return [];
    throw err;
  }
}

// GET /api/requests?profileId=X
router.get("/", async (req, res) => {
  const { profileId } = req.query;
  if (!profileId) return res.status(400).json({ error: "profileId query param is required" });
  try {
    if (supabase) {
      const { data, error } = await supabase.from("requests").select("*").eq("profile_id", profileId).order("created_at", { ascending: false });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ requests: data });
    }
    const data = await pgQueryRequests(profileId);
    return res.json({ requests: data });
  } catch (err) {
    console.error("GET /api/requests failed", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id
router.get("/:id", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from("requests").select("*").eq("id", req.params.id).single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }
    if (pool) {
      try {
        const { rows } = await pool.query(`SELECT * FROM requests WHERE id = $1 LIMIT 1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: "Request not found" });
        return res.json(rows[0]);
      } catch (err) {
        if (err.code === "42P01") return res.status(404).json({ error: "Request not found" });
        throw err;
      }
    }
    return res.status(404).json({ error: "Request not found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/requests/:id/status
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status is required" });
  try {
    let data;
    if (supabase) {
      const result = await supabase.from("requests").update({ status }).eq("id", req.params.id).select().single();
      if (result.error) return res.status(400).json({ error: result.error.message });
      data = result.data;
    } else if (pool) {
      const { rows } = await pool.query(`UPDATE requests SET status = $1 WHERE id = $2 RETURNING *`, [status, req.params.id]);
      data = rows[0];
    } else {
      return res.status(503).json({ error: "Database not configured" });
    }

    if (isBuildosConfigured() && data?.buildos_ref) {
      const path =
        data.buildos_event === "rfq.sent" ? `/sent-rfqs/${data.buildos_ref}` :
        data.buildos_event === "purchase-order.created" ? `/purchase-orders/${data.buildos_ref}` :
        `/purchase-requests/${data.buildos_ref}`;
      try { await buildosFetch(path, { method: "PATCH", body: { status } }); }
      catch (buildosErr) { console.error("BuildOS status mirror failed:", buildosErr.message); }
    }

    return res.json(data);
  } catch (err) {
    if (err.code === "42P01") return res.status(404).json({ error: "Request not found" });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:id/quote
router.post("/:id/quote", async (req, res) => {
  const { items, totalValue, notes, validUntil } = req.body || {};
  try {
    let request;
    if (supabase) {
      const { data, error } = await supabase.from("requests").select("*").eq("id", req.params.id).single();
      if (error || !data) return res.status(404).json({ error: "Request not found" });
      request = data;
    } else if (pool) {
      const { rows } = await pool.query(`SELECT * FROM requests WHERE id = $1 LIMIT 1`, [req.params.id]);
      request = rows[0];
      if (!request) return res.status(404).json({ error: "Request not found" });
    } else {
      return res.status(404).json({ error: "Request not found" });
    }

    if (!isBuildosConfigured()) return res.status(503).json({ error: "BuildOS integration is not configured" });

    let profile = null;
    if (supabase) {
      const { data } = await supabase.from("profiles").select("name, email, company, phone, buildos_supplier_id").eq("id", request.profile_id).single();
      profile = data;
    } else if (pool) {
      const { rows } = await pool.query(`SELECT name,email,company,phone,buildos_supplier_id FROM profiles WHERE id=$1 LIMIT 1`, [request.profile_id]);
      profile = rows[0] || null;
    }

    const ref = request.buildos_ref || null;
    const event = request.buildos_event || "";
    const supplierName = profile?.name || request.requester?.name || "Supplier";
    const supplierId = profile?.buildos_supplier_id || null;
    const lines = Array.isArray(items) ? items : [];
    const noteParts = [];
    if (event === "purchase-order.created" && ref) noteParts.push(`PO ${ref}`);
    if (notes) noteParts.push(notes);

    const buildos = await buildosFetch("/received-quotes", {
      method: "POST",
      body: {
        rfqRef: event === "rfq.sent" ? ref : null,
        prRef: event === "purchase-request.created" ? ref : null,
        supplierName, supplierId, status: "pending_review", items: lines,
        totalValue: Number(totalValue) || 0,
        notes: noteParts.join(" — ") || null,
        validUntil: validUntil || null,
      },
    });

    let invoice = null;
    let invoiceError = null;
    try {
      const invItems = lines.map((l) => ({
        description: l.material, quantity: Number(l.qty) || 0, rate: Number(l.unitPrice) || 0,
        amount: Number(l.total) || (Number(l.qty) || 0) * (Number(l.unitPrice) || 0),
      }));
      const currency = request.currency || "NGN";
      const invTotal = Number(totalValue) || invItems.reduce((s, i) => s + i.amount, 0);
      const requester = request.requester || {};
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
      invoice = await saveInvoice({
        invoiceNumber, clientEmail: requester.email || request.title || "Buyer",
        senderCompanyName: profile?.company || supplierName, total: invTotal, currency,
        template: "classic", privacyPolicyAccepted: false,
        payload: {
          items: invItems, total: invTotal, currency, invoiceNumber,
          invoiceDate: new Date().toISOString().slice(0, 10),
          companyName: profile?.company || supplierName, companyEmail: profile?.email || "", companyPhone: profile?.phone || "",
          clientName: requester.name || request.title || "Buyer", clientCompanyName: requester.company || requester.department || "",
          clientEmail: requester.email || "", notes: `Request: ${ref || request.requestNumber || request.id}`,
        },
        profileId: request.profile_id, status: "quote_submitted", buildosQuoteId: buildos?.id || null,
      });
    } catch (invErr) {
      invoiceError = invErr.message;
      console.error("Failed to create portal invoice for quote:", invErr.message);
    }

    if (supabase) {
      await supabase.from("requests").update({ status: "quoted", buildos_quote_id: buildos?.id || null }).eq("id", request.id);
    } else if (pool) {
      await pool.query(`UPDATE requests SET status='quoted', buildos_quote_id=$1 WHERE id=$2`, [buildos?.id || null, request.id]).catch(() => {});
    }

    return res.json({ ok: true, buildos, invoice, invoiceError });
  } catch (err) {
    if (err.code === "42P01") return res.status(404).json({ error: "Request not found" });
    console.error("BuildOS quote submit failed:", err.message);
    return res.status(502).json({ error: `Could not send to BuildOS: ${err.message}` });
  }
});

export default router;
