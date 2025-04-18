const express = require("express");
const db = require("../config/db"); // Ensure this is a promise-based DB connection
const { authenticate } = require("./authRoutes");
const router = express.Router();

// ✅ Link a Candidate to an Opportunity with Resume, Salary, Status, and Referral
router.post("/", authenticate, async (req, res) => {
  try {
    const { opportunity_id, candidate_id, resume_url, offered_salary, referral_user_id, status } = req.body;

    await db.execute(
      `INSERT INTO opportunity_candidates 
      (opportunity_id, candidate_id, resume_url, offered_salary, referral_user_id, status) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [opportunity_id, candidate_id, resume_url, offered_salary, referral_user_id, status || "Forwarded"]
    );

    res.status(201).json({ message: "Candidate linked to opportunity successfully" });
  } catch (error) {
    console.error("❌ Error linking candidate to opportunity:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/opportunity/:opportunity_id", authenticate, (req, res) => {
    const { opportunity_id } = req.params;
  
    db.query(
      `SELECT c.id, c.name, oc.resume_url, oc.offered_salary, oc.status, u.name AS referred_by 
       FROM opportunity_candidates oc
       JOIN candidates c ON oc.candidate_id = c.id 
       LEFT JOIN users u ON oc.referral_user_id = u.id 
       WHERE oc.opportunity_id = ?`,
      [opportunity_id],
      (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: "Candidates not found" });
        res.json(results);
      }
    );
  });

// ✅ Get all Opportunities for a Candidate
router.get("/candidate/:candidate_id", authenticate, async (req, res) => {
  try {
    const { candidate_id } = req.params;

    const [opportunities] = await db.execute(
      `SELECT o.id, o.title, o.company, oc.status, oc.offered_salary 
       FROM opportunity_candidates oc
       JOIN opportunities o ON oc.opportunity_id = o.id
       WHERE oc.candidate_id = ?`,
      [candidate_id]
    );

    res.json(opportunities);
  } catch (error) {
    console.error("❌ Error fetching opportunities for candidate:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Update Resume URL, Salary, Status for an Opportunity-Candidate Link
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { resume_url, offered_salary, status } = req.body;

    await db.execute(
      "UPDATE opportunity_candidates SET resume_url = ?, offered_salary = ?, status = ? WHERE id = ?",
      [resume_url, offered_salary, status, id]
    );

    res.json({ message: "Candidate opportunity details updated successfully" });
  } catch (error) {
    console.error("❌ Error updating opportunity candidate details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
