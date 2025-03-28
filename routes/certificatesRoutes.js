const { authenticate } = require('./authRoutes');
const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ✅ Get all certificates
router.get('/', authenticate, (req, res) => {
    db.query('SELECT * FROM certificates', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Get a single certificate by ID
router.get('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM certificates WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Certificate not found' });
        res.json(results[0]);
    });
});

// ✅ Add a new certificate
router.post('/', authenticate, (req, res) => {
    const { name, provider } = req.body;

    if (!name || !provider) {
        return res.status(400).json({ error: "Certificate name and provider are required" });
    }

    db.query('INSERT INTO certificates (name, provider) VALUES (?, ?)', [name, provider], (err, result) => {
        if (err) return res.status(500).json({ error: err });

        // ✅ Fetch the newly inserted certificate from DB
        db.query('SELECT * FROM certificates WHERE id = ?', [result.insertId], (err, rows) => {
            if (err) return res.status(500).json({ error: err });

            res.json(rows[0]); // ✅ Return full certificate data to frontend
        });
    });
});

// ✅ Update certificate details
router.put('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Certificate name is required" });
    }

    db.query('UPDATE certificates SET name = ?, provide = ? WHERE id = ?', [name, id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, message: 'Certificate updated successfully' });
    });
});

// ✅ Delete a certificate
router.delete('/:id', authenticate, (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM certificates WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, message: 'Certificate deleted successfully' });
    });
});

// ✅ Get candidates who have a specific certificate
router.get('/by-certificate/:certificate_id', authenticate, (req, res) => {
    const { certificate_id } = req.params;

    db.query(`
        SELECT c.id, c.name, c.email FROM candidates c
        JOIN candidate_certificates cc ON c.id = cc.candidate_id
        WHERE cc.certificate_id = ?`, [certificate_id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

module.exports = router;
