const { authenticate } = require('./authRoutes');
const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ✅ Create Technology
router.post('/technologies', authenticate, (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Technology name is required" });
    }

    db.query('INSERT INTO technologies (name) VALUES (?)', [name], (err, result) => {
        if (err) return res.status(500).json({ error: err });

        db.query('SELECT * FROM technologies WHERE id = ?', [result.insertId], (err, rows) => {
            if (err) return res.status(500).json({ error: err });
            res.json(rows[0]);
        });
    });
});

// ✅ Get All Technologies
router.get('/technologies', authenticate, (req, res) => {
    db.query('SELECT * FROM technologies', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Create Domain
router.post('/domains', authenticate, (req, res) => {
    const { name, technology_id } = req.body;

    if (!name || !technology_id) {
        return res.status(400).json({ error: "Domain name and technology ID are required" });
    }

    db.query('INSERT INTO domains (name, technology_id) VALUES (?, ?)', [name, technology_id], (err, result) => {
        if (err) return res.status(500).json({ error: err });

        db.query('SELECT * FROM domains WHERE id = ?', [result.insertId], (err, rows) => {
            if (err) return res.status(500).json({ error: err });
            res.json(rows[0]);
        });
    });
});

// ✅ Get Domains by Technology
router.get('/domains/:techId', authenticate, (req, res) => {
    const { techId } = req.params;

    db.query('SELECT * FROM domains WHERE technology_id = ?', [techId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Create Skill
router.post('/skills', authenticate, (req, res) => {
    const { name, domain_id } = req.body;

    if (!name || !domain_id) {
        return res.status(400).json({ error: "Skill name and domain ID are required" });
    }

    db.query('INSERT INTO skills (name, domain_id) VALUES (?, ?)', [name, domain_id], (err, result) => {
        if (err) return res.status(500).json({ error: err });

        db.query('SELECT * FROM skills WHERE id = ?', [result.insertId], (err, rows) => {
            if (err) return res.status(500).json({ error: err });
            res.json(rows[0]);
        });
    });
});

// ✅ Get Skills by Domain
router.get('/skills/:domainId', authenticate, (req, res) => {
    const { domainId } = req.params;

    db.query('SELECT * FROM skills WHERE domain_id = ?', [domainId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Delete Technology
router.delete('/technologies/:id', authenticate, (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM technologies WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, message: 'Technology deleted successfully' });
    });
});

// ✅ Delete Domain
router.delete('/domains/:id', authenticate, (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM domains WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, message: 'Domain deleted successfully' });
    });
});

// ✅ Delete Skill
router.delete('/skills/:id', authenticate, (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM skills WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, message: 'Skill deleted successfully' });
    });
});

module.exports = router;
