const { authenticate } = require('./authRoutes');

const express = require('express');
const db = require('../config/db');

const router = express.Router();

// ✅ Get all jobs
router.get('/', authenticate, (req, res) => {
    db.query('SELECT * FROM opportunity', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Get a job by ID
router.get('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM opportunity WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Job not found' });
        res.json(results[0]);
    });
});

// ✅ Add a new job
router.post('/', authenticate, (req, res) => {
    const { title, company, location, required_skills, rate_per_hour, status } = req.body;
    db.query(
        'INSERT INTO opportunity (title, company, location, required_skills, rate_per_hour, status) VALUES (?, ?, ?, ?, ?, ?)',
        [title, company, location, JSON.stringify(required_skills), rate_per_hour, status],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, id: result.insertId });
        }
    );
});

// ✅ Update an existing job
router.put('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const { title, company, location, required_skills, rate_per_hour, status, job_description } = req.body;

    db.query(
        'UPDATE opportunity SET title=?, company=?, location=?, required_skills=?, rate_per_hour=?, status=?, job_description=? WHERE id=?',
        [title, company, location, JSON.stringify(required_skills), rate_per_hour, status, job_description, id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Job not found' });
            res.json({ success: true, message: 'Opportunity updated successfully' });
        }
    );
});

module.exports = router;
