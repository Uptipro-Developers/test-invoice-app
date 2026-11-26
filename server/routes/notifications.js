import express from "express";
import { supabase, pool } from "../db.js";
const router = express.Router();

router.get("/:profileId", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("profile_id", req.params.profileId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return res.json(data);
    }
    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.params.profileId],
    );
    return res.json(rows);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }
    const { rows } = await pool.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 RETURNING *`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Notification not found" });
    return res.json(rows[0]);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

export default router;
