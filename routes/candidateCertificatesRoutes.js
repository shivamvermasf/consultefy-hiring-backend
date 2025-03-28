const { authenticate } = require('./authRoutes');
const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ✅ Get all certificates of a candidate
router.get('/:candidate_id/certificates', authenticate, (req, res) => {
    const { candidate_id } = req.params;

    db.query(`
        SELECT c.id, c.name FROM candidate_certificates cc
        JOIN certificates c ON cc.certificate_id = c.id
        WHERE cc.candidate_id = ?`, [candidate_id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Assign certificates to a candidate (Replace existing)
router.post('/:candidate_id/certificates', authenticate, (req, res) => {
    const { candidate_id } = req.params;
    const { certificates } = req.body;

    if (!Array.isArray(certificates)) {
        return res.status(400).json({ error: "Invalid certificates format" });
    }

    db.query('DELETE FROM candidate_certificates WHERE candidate_id = ?', [candidate_id], (err) => {
        if (err) return res.status(500).json({ error: err });

        if (certificates.length === 0) {
            return res.json({ success: true, message: 'Certificates cleared' });
        }

        const values = certificates.map(certId => [candidate_id, certId]);
        db.query('INSERT INTO candidate_certificates (candidate_id, certificate_id) VALUES ?', [values], (err) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, message: 'Certificates updated successfully' });
        });
    });
});

module.exports = router;
