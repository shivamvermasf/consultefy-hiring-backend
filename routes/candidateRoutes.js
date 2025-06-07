const express = require('express');
const db = require('../config/db');
const router = express.Router();

// ✅ Get total count of candidates
router.get('/count', (req, res) => {
    console.log('Fetching candidate count...'); // Debug log
    db.query('SELECT COUNT(*) as total FROM candidates', (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('Count results:', results); // Debug log
        res.json({ total: results[0].total });
    });
});

// ✅ Get all candidates
router.get('/', (req, res) => {
    db.query('SELECT * FROM candidates', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Get a single candidate by ID
router.get('/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM candidates WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Candidate not found' });
        res.json(results[0]);
    });
});

// ✅ Add a new candidate
router.post('/', (req, res) => {
    const { name, email, phone, linkedin, skills, experience, expected_salary, resume_link } = req.body;
    db.query(
        'INSERT INTO candidates (name, email, phone, linkedin, skills, experience, expected_salary, resume_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, email, phone, linkedin, JSON.stringify(skills), experience, expected_salary, JSON.stringify([resume_link])],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, id: result.insertId });
        }
    );
});

// ✅ Update candidate details
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { name, email, phone, linkedin, skills, experience, expected_salary, resume_links } = req.body;
    db.query(
        'UPDATE candidates SET name=?, email=?, phone=?, linkedin=?, skills=?, experience=?, expected_salary=?, resume_links=? WHERE id=?',
        [name, email, phone, linkedin, JSON.stringify(skills), experience, expected_salary, JSON.stringify(resume_links), id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, message: 'Candidate updated successfully' });
        }
    );
});

// ✅ Delete a candidate
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM candidates WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true, message: 'Candidate deleted successfully' });
    });
});

router.post('/match', (req, res) => {
    const { required_skills } = req.body;

    if (!required_skills || !Array.isArray(required_skills)) {
        return res.status(400).json({ error: "Invalid skills input" });
    }

    const query = `
        SELECT * FROM candidates
        WHERE JSON_OVERLAPS(skills, ?)
    `;

    db.query(query, [JSON.stringify(required_skills)], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

module.exports = router;
