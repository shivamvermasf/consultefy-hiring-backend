const { authenticate } = require('./authRoutes');

const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ✅ Get all jobs
router.get('/', authenticate, (req, res) => {
    db.query('SELECT * FROM jobs', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Get a job by ID
router.get('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM jobs WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Job not found' });
        res.json(results[0]);
    });
});

// ✅ Add a new job
router.post('/', authenticate, (req, res) => {
    const { title, company, location, required_skills, rate_per_hour, status } = req.body;
    db.query(
        'INSERT INTO jobs (title, company, location, required_skills, rate_per_hour, status) VALUES (?, ?, ?, ?, ?, ?)',
        [title, company, location, JSON.stringify(required_skills), rate_per_hour, status],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, id: result.insertId });
        }
    );
});

module.exports = router;
