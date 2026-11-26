import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { supabase, pool } from "../db.js";
import { notifyProfiles } from "../notify.js";
import {
  applyAgreedPricing,
  resolveNegotiatedItems,
} from "../negotiationPricing.js";

const router = express.Router();

/** Reject deliveries older than this to bound the replay window. */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

/**
 * Verify the HMAC-SHA256 signature BuildOS sends over `<timestamp>.<rawBody>`.
 *
 * The previous implementation signed `JSON.stringify(req.body)` — a re-encoding
 * of the parsed body, which is not byte-identical to what was signed — and
 * compared it against a header BuildOS never sent (BuildOS was sending the
 * shared secret in plaintext in `X-Webhook-Secret` instead). Every delivery
 * therefore failed, and after five failures BuildOS deactivated the webhook.
 *
 * Returns null when valid, or a string describing why it was rejected.
 */
function verifySignature(req) {
  const secret = process.env.BUILDOS_WEBHOOK_SECRET;
  if (!secret) return "Webhook secret not configured";

  const header = req.headers["x-buildos-signature"];
  const timestamp = req.headers["x-buildos-timestamp"];
  if (!header || !timestamp) return "Missing signature headers";

  const age = Date.now() - Date.parse(String(timestamp));
  if (!Number.isFinite(age)) return "Invalid signature timestamp";
  if (Math.abs(age) > MAX_SIGNATURE_AGE_MS) return "Signature timestamp outside tolerance";

  if (!req.rawBody) return "Raw body unavailable";

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${req.rawBody.toString("utf8")}`)
    .digest("hex");

  // Strip the "sha256=" prefix, then compare fixed-width hex buffers so
  // timingSafeEqual cannot throw on a length mismatch.
  const provided = String(header).replace(/^sha256=/, "");
  if (provided.length !== expected.length) return "Signature mismatch";

  const ok = timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(expected, "hex"),
  );
  return ok ? null : "Signature mismatch";
}

/**
 * Gather every supplier id and email a BuildOS payload can carry.
 *
 * The three event shapes address a supplier differently, and reading only the
 * top level missed two of them — which is why purchase requests always stored
 * unassigned and never reached the supplier they were raised for:
 *  - purchase-order.created carries a top-level `supplierId` and an included
 *    `supplier` object.
 *  - rfq.sent carries `supplierId` and the raiser-entered `contactEmail`.
 *  - purchase-request.created carries neither at the top level; the supplier(s)
 *    live in a `suppliers[]` array of `{ supplier, supplierId }`.
 */
function collectSupplierRefs(data) {
  const ids = new Set();
  const emails = new Set();
  const addId = (v) => v && ids.add(String(v));
  const addEmail = (v) => v && emails.add(String(v).trim());

  addId(data.supplierId);
  addId(data.vendorId);
  addEmail(data.supplier?.email);
  addEmail(data.supplierEmail);
  addEmail(data.vendorEmail);
  addEmail(data.contactEmail);

  if (Array.isArray(data.suppliers)) {
    for (const s of data.suppliers) {
      addId(s?.supplierId || s?.id);
      addEmail(s?.email);
    }
  }

  return { ids: [...ids], emails: [...emails] };
}

/**
 * Resolve the BuildOS supplier on the payload to a SabiQuot profile.
 *
 * BuildOS supplier ids are cuids while profiles.id is a uuid, so the two can
 * only be matched through the buildos_supplier_id bridge column. Email is a
 * fallback so requests appear before the profile has been formally linked via
 * the Profile page. A request that cannot be matched is still stored, with a
 * null profile_id, so it surfaces for reconciliation rather than being dropped.
 */
async function resolveProfileId(data) {
  const { ids, emails } = collectSupplierRefs(data);

  // Primary: match by the stable BuildOS supplier id bridge column.
  for (const supplierId of ids) {
    try {
      if (supabase) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("buildos_supplier_id", supplierId)
          .maybeSingle();
        if (error) throw error;
        if (profile?.id) return profile.id;
      } else if (pool) {
        const { rows } = await pool.query(
          `SELECT id FROM profiles WHERE buildos_supplier_id = $1 LIMIT 1`,
          [supplierId],
        );
        if (rows[0]?.id) return rows[0].id;
      }
    } catch (error) {
      console.error("Supplier → profile lookup (by id) failed:", error.message);
    }
  }

  // Fallback: match by supplier email, case-insensitively so a difference in
  // casing between the ERP record and the portal profile does not orphan it.
  for (const email of emails) {
    try {
      if (supabase) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        if (error) throw error;
        if (profile?.id) return profile.id;
      } else if (pool) {
        const { rows } = await pool.query(
          `SELECT id FROM profiles WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [email],
        );
        if (rows[0]?.id) return rows[0].id;
      }
    } catch (error) {
      console.error("Supplier → profile lookup (by email) failed:", error.message);
    }
  }

  return null;
}

const HANDLED_EVENTS = new Set([
  "purchase-request.created",
  "rfq.sent",
  "purchase-order.created",
  "quote.negotiated",
  "quote.agreed",
]);

async function findInvoiceByBuildosQuoteId(quoteId) {
  if (supabase) {
    const result = await supabase
      .from("invoices")
      .select("id, profile_id, invoice_number, total, payload")
      .eq("buildos_quote_id", String(quoteId))
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
  if (pool) {
    const result = await pool.query(
      `SELECT id, profile_id, invoice_number, total, payload FROM invoices
       WHERE buildos_quote_id = $1 ORDER BY id DESC LIMIT 1`,
      [String(quoteId)],
    );
    return result.rows[0] || null;
  }
  return null;
}

async function findLatestNegotiation(invoiceId) {
  if (supabase) {
    const result = await supabase
      .from("negotiations")
      .select("id, items")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
  if (pool) {
    const result = await pool.query(
      `SELECT id, items FROM negotiations
       WHERE invoice_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [invoiceId],
    );
    return result.rows[0] || null;
  }
  return null;
}

/**
 * Surface a buyer counter-offer (raised in BuildOS) on the supplier's portal.
 *
 * The invoice is found through invoices.buildos_quote_id — the link written
 * when the supplier submitted the quote from a request. Setting the invoice to
 * "negotiating" is what makes it appear on the Negotiations page; the
 * negotiation row (sender_profile_id null = "from the buyer") gives the thread
 * its opening counter. Both are best-effort: a missing link is acknowledged so
 * BuildOS does not retry to exhaustion.
 */
async function handleQuoteNegotiated(data, res) {
  let invoice = null;
  try {
    invoice = await findInvoiceByBuildosQuoteId(data.id);
  } catch (error) {
    console.error(`quote.negotiated ${data.id} lookup failed:`, error.message);
    return res.status(500).json({ error: error.message });
  }
  if (!invoice) {
    return res.json({ received: true, event: "quote.negotiated", ignored: true, reason: "no linked invoice" });
  }

  const proposedTotal = Number(data.proposedAmount) || 0;
  const message = data.comment || `Buyer counter-offer (round ${data.round ?? 1})`;
  const items = resolveNegotiatedItems(
    invoice.payload?.items,
    data.items,
    proposedTotal,
  );
  if (supabase) {
    const invoiceUpdate = await supabase.from("invoices").update({ status: "negotiating" }).eq("id", invoice.id);
    if (invoiceUpdate.error) return res.status(500).json({ error: invoiceUpdate.error.message });
    const negotiationInsert = await supabase.from("negotiations").insert([{
      invoice_id: invoice.id,
      sender_profile_id: null,
      proposed_total: proposedTotal,
      items,
      message,
    }]);
    if (negotiationInsert.error) return res.status(500).json({ error: negotiationInsert.error.message });
  } else if (pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE invoices SET status = 'negotiating' WHERE id = $1`, [invoice.id]);
      await client.query(
        `INSERT INTO negotiations (invoice_id, sender_profile_id, proposed_total, items, message)
         VALUES ($1, NULL, $2, $3, $4)`,
        [invoice.id, proposedTotal, JSON.stringify(items), message],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  res.json({ received: true, event: "quote.negotiated", invoiceId: invoice.id });

  if (invoice.profile_id) {
    notifyProfiles(
      [invoice.profile_id],
      invoice.id,
      "counter_offer",
      `Buyer countered your quote on invoice ${invoice.invoice_number}`,
    ).catch((err) => console.error("Failed to notify supplier:", err.message));
  }
}

/** Final buyer award: close the local negotiation at BuildOS's agreed total. */
async function handleQuoteAgreed(data, res) {
  let invoice;
  try {
    invoice = await findInvoiceByBuildosQuoteId(data.id);
  } catch (error) {
    console.error(`quote.agreed ${data.id} lookup failed:`, error.message);
    return res.status(500).json({ error: error.message });
  }
  if (!invoice) {
    return res.json({
      received: true,
      event: "quote.agreed",
      ignored: true,
      reason: "no linked invoice",
    });
  }

  const agreedTotal = Number(data.agreedAmount);
  if (!Number.isFinite(agreedTotal) || agreedTotal < 0) {
    return res.status(400).json({ error: "data.agreedAmount must be a valid amount" });
  }

  try {
    const latestRound = await findLatestNegotiation(invoice.id);
    const payload = applyAgreedPricing(
      invoice,
      data.items || latestRound?.items,
      agreedTotal,
    );
    if (supabase) {
      const invoiceUpdate = await supabase
        .from("invoices")
        .update({ status: "accepted", total: agreedTotal, payload })
        .eq("id", invoice.id);
      if (invoiceUpdate.error) throw invoiceUpdate.error;

      if (latestRound?.id) {
        const roundUpdate = await supabase
          .from("negotiations")
          .update({
            status: "accepted",
            proposed_total: agreedTotal,
            items: payload.items,
          })
          .eq("id", latestRound.id);
        if (roundUpdate.error) throw roundUpdate.error;
      }
    } else if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE invoices SET status = 'accepted', total = $1, payload = $2 WHERE id = $3`,
          [agreedTotal, JSON.stringify(payload), invoice.id],
        );
        await client.query(
          `UPDATE negotiations
           SET status = 'accepted', proposed_total = $1, items = $2
           WHERE id = $3`,
          [agreedTotal, JSON.stringify(payload.items), latestRound?.id || null],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    received: true,
    event: "quote.agreed",
    invoiceId: invoice.id,
    status: "accepted",
    agreedTotal,
  });

  if (invoice.profile_id) {
    notifyProfiles(
      [invoice.profile_id],
      invoice.id,
      "offer_accepted",
      `Your quote for invoice ${invoice.invoice_number} was agreed at ${agreedTotal}.`,
    ).catch((err) => console.error("Failed to notify supplier:", err.message));
  }
}

/** PostgREST codes that will never succeed on retry, however many times BuildOS resends. */
const PERMANENT_STORAGE_CODES = new Set([
  "PGRST204", // column not found in the schema cache
  "PGRST100", // unparseable request
  "42703", // undefined_column
  "42P01", // undefined_table
  "23502", // not_null_violation
  "23503", // foreign_key_violation
]);

function isPermanentStorageError(error) {
  return PERMANENT_STORAGE_CODES.has(String(error?.code ?? ""));
}

/** Specifically "this deployment has not run a migration that adds column X". */
function isMissingColumnError(error) {
  const code = String(error?.code ?? "");
  return code === "PGRST204" || code === "42703";
}

/** The column name out of a PostgREST/Postgres missing-column message, if present. */
function missingColumnName(error) {
  const match = /'([^']+)' column/.exec(String(error?.message ?? ""));
  return match?.[1] ?? null;
}

/** One upsert attempt, keyed on the BuildOS id for idempotency. */
function storeRequest(row) {
  if (supabase) {
    return supabase
      .from("requests")
      .upsert([row], { onConflict: "buildos_ref" })
      .select("id")
      .single();
  }
  return pool
    .query(
      `INSERT INTO requests
        (profile_id, title, amount, currency, status, materials, buildos_ref, buildos_event)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (buildos_ref) DO UPDATE SET
         profile_id = EXCLUDED.profile_id,
         title = EXCLUDED.title,
         amount = EXCLUDED.amount,
         currency = EXCLUDED.currency,
         status = EXCLUDED.status,
         materials = EXCLUDED.materials,
         buildos_event = EXCLUDED.buildos_event
       RETURNING id`,
      [
        row.profile_id,
        row.title,
        row.amount ?? null,
        row.currency || "NGN",
        row.status,
        JSON.stringify(row.materials || []),
        row.buildos_ref,
        row.buildos_event,
      ],
    )
    .then((result) => ({ data: result.rows[0], error: null }))
    .catch((error) => ({ data: null, error }));
}

// POST /api/buildos-webhook — receives events from BuildOS ERP
router.post("/", async (req, res) => {
  const rejection = verifySignature(req);
  if (rejection) {
    console.warn(`Rejected BuildOS webhook: ${rejection}`);
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, data } = req.body || {};
  if (!event || !data) {
    return res.status(400).json({ error: "event and data are required" });
  }

  // Acknowledge unhandled events. Returning an error would make BuildOS retry
  // them to exhaustion and then deactivate the endpoint for every event.
  if (!HANDLED_EVENTS.has(event)) {
    return res.json({ received: true, event, ignored: true });
  }

  if (!data.id) {
    return res
      .status(400)
      .json({ error: "data.id is required as the idempotency key" });
  }

  // A buyer counter-offer raised in the ERP. data.id is the BuildOS quote id,
  // which links to the portal invoice through invoices.buildos_quote_id.
  if (event === "quote.negotiated") {
    return handleQuoteNegotiated(data, res);
  }
  if (event === "quote.agreed") {
    return handleQuoteAgreed(data, res);
  }

  const profileId = await resolveProfileId(data);
  if (!profileId) {
    console.warn(
      `BuildOS ${event} ${data.id}: no profile linked to supplier ${
        data.supplierId || data.vendorId || "(none supplied)"
      } — storing unassigned`,
    );
  }

  const row = {
    profile_id: profileId,
    title:
      data.description || data.rfqRef || data.prRef || data.title || "ERP Request",
    amount: data.totalAmount ?? data.budgetAmount ?? data.totalValue ?? null,
    currency: data.currency || "NGN",
    status: "received",
    materials: Array.isArray(data.items) ? data.items : [],
    buildos_ref: String(data.id),
    buildos_event: event,
  };

  // Upsert rather than insert: deliveries now retry with backoff, so the same
  // event can legitimately arrive more than once.
  let { data: saved, error } = await storeRequest(row);

  // A column this deployment has not migrated yet (PGRST204) is permanent: the
  // same delivery will fail identically forever. Dropping the optional display
  // columns and retrying keeps the supplier's request visible — without an
  // amount, rather than not at all — instead of failing the delivery.
  if (error && isMissingColumnError(error)) {
    const missing = missingColumnName(error);
    console.warn(
      `requests.${missing ?? "(unknown column)"} is missing — storing BuildOS ` +
        `${event} ${data.id} without amount/currency. Apply supabase/migrations/` +
        `010_requests_amount_currency.sql to record them.`,
    );
    const core = { ...row };
    delete core.amount;
    delete core.currency;
    ({ data: saved, error } = await storeRequest(core));
  }

  if (error) {
    console.error(`Failed to store BuildOS ${event} ${data.id}:`, error.message);
    // 4xx for anything that cannot succeed on retry. BuildOS counts every
    // failed delivery toward `maxRetries` and deactivates the endpoint when it
    // runs out, so returning 5xx for a permanent fault burns the retry budget
    // and takes the whole integration down — which is how the previous endpoint
    // died. 5xx stays reserved for genuinely transient faults, where a retry is
    // the right thing to ask for.
    return res.status(isPermanentStorageError(error) ? 422 : 500).json({
      error: error.message,
    });
  }

  res.json({
    received: true,
    event,
    requestId: saved?.id,
    assigned: Boolean(profileId),
  });

  // Notify the supplier in-app (and by email if SMTP is configured).
  if (profileId) {
    const label =
      event === "rfq.sent" ? "RFQ" :
      event === "purchase-order.created" ? "Purchase Order" :
      "Purchase Request";
    notifyProfiles(
      [profileId],
      null,
      "erp_request",
      `New ${label} from your buyer — ref: ${data.rfqRef || data.poNumber || data.prRef || data.id}`,
    ).catch((err) => console.error("Failed to notify supplier:", err.message));
  }
});

export default router;
