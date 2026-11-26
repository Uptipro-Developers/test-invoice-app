import express from "express";
import { supabase, pool } from "../db.js";
import { notifyProfiles } from "../notify.js";
import { buildosFetch, isBuildosConfigured } from "../buildosClient.js";
import {
  applyAgreedPricing,
  resolveNegotiatedItems,
} from "../negotiationPricing.js";
const router = express.Router();

async function createNegotiation(row) {
  if (supabase) {
    const { data, error } = await supabase.from("negotiations").insert([row]).select().single();
    if (error) throw error;
    return data;
  }
  const { rows } = await pool.query(
    `INSERT INTO negotiations (invoice_id, sender_profile_id, proposed_total, items, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      row.invoice_id,
      row.sender_profile_id || null,
      row.proposed_total,
      JSON.stringify(row.items || []),
      row.message || null,
    ],
  );
  return rows[0];
}

async function listNegotiations(invoiceId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("negotiations")
      .select("*, profiles(name, company, role)")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  }
  const { rows } = await pool.query(
    `SELECT n.*,
       CASE WHEN p.id IS NULL THEN NULL
            ELSE json_build_object('name', p.name, 'company', p.company, 'role', p.role)
       END AS profiles
     FROM negotiations n
     LEFT JOIN profiles p ON p.id = n.sender_profile_id
     WHERE n.invoice_id = $1 ORDER BY n.created_at ASC`,
    [invoiceId],
  );
  return rows;
}

async function updateNegotiationStatus(id, status) {
  if (supabase) {
    const { data, error } = await supabase
      .from("negotiations")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { rows } = await pool.query(
    `UPDATE negotiations SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id],
  );
  if (!rows[0]) throw new Error("Negotiation not found");
  return rows[0];
}

async function updateInvoice(id, updates) {
  if (supabase) {
    const { error } = await supabase.from("invoices").update(updates).eq("id", id);
    if (error) throw error;
    return;
  }
  const keys = Object.keys(updates);
  const values = keys.map((key) => updates[key]);
  values.push(id);
  await pool.query(
    `UPDATE invoices SET ${keys.map((key, i) => `${key} = $${i + 1}`).join(", ")}
     WHERE id = $${values.length}`,
    values,
  );
}

async function getInvoice(id, columns = "*") {
  if (supabase) {
    const { data, error } = await supabase.from("invoices").select(columns).eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
  // Every caller uses server-owned column lists; never pass user input here.
  const { rows } = await pool.query(`SELECT ${columns} FROM invoices WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function listMessages(negotiationId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("negotiation_messages")
      .select("*, profiles(name, company, role)")
      .eq("negotiation_id", negotiationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  }
  const { rows } = await pool.query(
    `SELECT m.*,
       CASE WHEN p.id IS NULL THEN NULL
            ELSE json_build_object('name', p.name, 'company', p.company, 'role', p.role)
       END AS profiles
     FROM negotiation_messages m
     LEFT JOIN profiles p ON p.id = m.sender_profile_id
     WHERE m.negotiation_id = $1 ORDER BY m.created_at ASC`,
    [negotiationId],
  );
  return rows;
}

async function createMessage(negotiationId, senderProfileId, content) {
  if (supabase) {
    const { data, error } = await supabase
      .from("negotiation_messages")
      .insert([{ negotiation_id: negotiationId, sender_profile_id: senderProfileId, content }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { rows } = await pool.query(
    `INSERT INTO negotiation_messages (negotiation_id, sender_profile_id, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [negotiationId, senderProfileId, content],
  );
  return rows[0];
}

async function linkedBuildosQuote(invoiceId) {
  if (!isBuildosConfigured()) {
    return { quoteId: null, error: "BuildOS integration is not configured." };
  }
  let invoice;
  try {
    invoice = await getInvoice(invoiceId, "buildos_quote_id");
  } catch (error) {
    return { quoteId: null, error: error.message };
  }
  if (!invoice?.buildos_quote_id) {
    return { quoteId: null, error: "This invoice is not linked to a BuildOS quote." };
  }
  return { quoteId: invoice.buildos_quote_id, error: null };
}

// Mirror a revised supplier counter amount while the quote remains under
// review. Best-effort: the local negotiation is still the source of what the
// supplier submitted, and the response tells the UI if the ERP mirror failed.
async function syncQuoteToBuildos(invoiceId, patch) {
  const { quoteId, error } = await linkedBuildosQuote(invoiceId);
  if (!quoteId) return { synced: false, error };
  try {
    await buildosFetch(`/received-quotes/${quoteId}`, {
      method: "PATCH",
      body: patch,
    });
    return { synced: true, error: null };
  } catch (err) {
    console.error("BuildOS quote sync failed:", err.message);
    return { synced: false, error: err.message };
  }
}

// A supplier response is deliberately separate from BuildOS's internal quote
// approval endpoint. It records acceptance/rejection of the buyer's latest
// counter, while Procurement retains authority to approve the quote and raise
// the purchase order.
async function syncSupplierResponse(invoiceId, decision, agreedTotal, message) {
  const { quoteId, error } = await linkedBuildosQuote(invoiceId);
  if (!quoteId) return { synced: false, error };
  try {
    await buildosFetch(`/received-quotes/${quoteId}/supplier-response`, {
      method: "POST",
      body: { decision, agreedTotal, message },
    });
    return { synced: true, error: null };
  } catch (err) {
    console.error("BuildOS supplier-response sync failed:", err.message);
    return { synced: false, error: err.message };
  }
}

// Supplier submits a counter-offer
router.post("/", async (req, res) => {
  const { invoice_id, sender_profile_id, proposed_total, message, items } = req.body;

  let invoice;
  try {
    invoice = await getInvoice(invoice_id, "id, profile_id, invoice_number, status, total, payload");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "accepted" || invoice.status === "finalized") {
    return res.status(409).json({
      error: "This negotiation is complete and can no longer be changed.",
    });
  }

  const resolvedItems = resolveNegotiatedItems(
    invoice.payload?.items,
    items,
    proposed_total,
  );

  let data;
  try {
    data = await createNegotiation({
      invoice_id,
      sender_profile_id,
      proposed_total,
      items: resolvedItems,
      message,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // Mark invoice as negotiating
  await updateInvoice(invoice_id, { status: "negotiating" });

  // Notify the buyer
  if (invoice?.profile_id) {
    try {
      await notifyProfiles(
        [invoice.profile_id],
        invoice_id,
        "counter_offer",
        `New counter-offer on invoice ${invoice.invoice_number}`,
      );
    } catch (notifyErr) {
      console.error("notifyProfiles failed:", notifyErr);
    }
  }

  // Mirror the counter-offer amount onto the ERP quote (still under review).
  await syncQuoteToBuildos(invoice_id, {
    totalValue: Number(proposed_total) || 0,
    notes: message || null,
  });

  res.json(data);
});

// Get all negotiation threads for an invoice
router.get("/:invoiceId", async (req, res) => {
  try {
    return res.json(await listNegotiations(req.params.invoiceId));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// Accept a negotiation offer
router.patch("/:id/accept", async (req, res) => {
  let neg;
  try {
    neg = await updateNegotiationStatus(req.params.id, "accepted");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const invoice = await getInvoice(neg.invoice_id, "id, payload, total");
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const payload = applyAgreedPricing(invoice, neg.items, neg.proposed_total);
  await updateInvoice(neg.invoice_id, {
    status: "accepted",
    total: neg.proposed_total,
    payload,
  });

  try {
    await notifyProfiles(
      [neg.sender_profile_id],
      neg.invoice_id,
      "accepted",
      "Your counter-offer was accepted!",
    );
  } catch (notifyErr) {
    console.error("notifyProfiles failed:", notifyErr);
  }

  const buildosSync = await syncSupplierResponse(
    neg.invoice_id,
    "accepted",
    Number(neg.proposed_total) || 0,
    neg.message || "Supplier accepted the buyer counter-offer.",
  );

  res.json({ ...neg, buildosSync });
});

// Reject a negotiation offer
router.patch("/:id/reject", async (req, res) => {
  let neg;
  try {
    neg = await updateNegotiationStatus(req.params.id, "rejected");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    await notifyProfiles(
      [neg.sender_profile_id],
      neg.invoice_id,
      "rejected",
      "Your counter-offer was declined.",
    );
  } catch (notifyErr) {
    console.error("notifyProfiles failed:", notifyErr);
  }
  const buildosSync = await syncSupplierResponse(
    neg.invoice_id,
    "rejected",
    null,
    neg.message || "Supplier rejected the buyer counter-offer.",
  );
  res.json({ ...neg, buildosSync });
});

// GET /api/negotiate/:id/messages — fetch the message thread for a negotiation
router.get("/:id/messages", async (req, res) => {
  try {
    return res.json(await listMessages(req.params.id));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// POST /api/negotiate/:id/messages — send a message in a negotiation thread
router.post("/:id/messages", async (req, res) => {
  const { sender_profile_id, content } = req.body;
  if (!sender_profile_id || !content) {
    return res
      .status(400)
      .json({ error: "sender_profile_id and content are required" });
  }
  try {
    const data = await createMessage(req.params.id, sender_profile_id, content);
    return res.status(201).json(data);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

export default router;
