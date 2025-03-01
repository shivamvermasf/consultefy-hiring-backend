const express = require('express');
const db = require('../config/db');
const { authenticate } = require('./authRoutes');

const router = express.Router();

// ✅ Get all escalations
router.get('/', authenticate, (req, res) => {
    db.query('SELECT * FROM escalations', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Add an escalation
router.post('/', authenticate, (req, res) => {
    const { candidate_id, job_id, reason, escalation_date } = req.body;

    db.query(
        'INSERT INTO escalations (candidate_id, job_id, reason, escalation_date) VALUES (?, ?, ?, ?)',
        [candidate_id, job_id, reason, escalation_date],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });

            // ❗ Reduce trust score of the candidate
            db.query(
                'UPDATE candidates SET trust_score = trust_score - 10 WHERE id = ?',
                [candidate_id]
            );

            res.json({ success: true, id: result.insertId });
        }
    );
});

module.exports = router;
