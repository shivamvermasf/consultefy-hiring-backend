const express = require('express');
const db = require('../config/db');
const { authenticate } = require('./authRoutes');

const router = express.Router();

// ✅ Get all payments
router.get('/', authenticate, (req, res) => {
    db.query('SELECT * FROM payments', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// ✅ Add a new payment
router.post('/', authenticate, (req, res) => {
    const { candidate_id, job_id, salary, client_payment, payment_date } = req.body;

    db.query(
        'INSERT INTO payments (candidate_id, job_id, salary, client_payment, payment_date) VALUES (?, ?, ?, ?, ?)',
        [candidate_id, job_id, salary, client_payment, payment_date],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ success: true, id: result.insertId });
        }
    );
});

router.post('/', authenticate, (req, res) => {
    const { candidate_id, job_id, salary, client_payment, payment_date } = req.body;

    db.query(
        'INSERT INTO payments (candidate_id, job_id, salary, client_payment, payment_date) VALUES (?, ?, ?, ?, ?)',
        [candidate_id, job_id, salary, client_payment, payment_date],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });

            // Increase trust score on successful job completion
            db.query(
                'UPDATE candidates SET trust_score = LEAST(trust_score + 10, 100) WHERE id = ?',
                [candidate_id]
            );

            res.json({ success: true, id: result.insertId });
        }
    );
});

router.get('/monthly-report', authenticate, (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
        return res.status(400).json({ error: "Month and year are required" });
    }

    const query = `
        SELECT SUM(client_payment) AS total_revenue, 
               SUM(salary) AS total_salary, 
               SUM(client_payment - salary) AS total_profit
        FROM payments
        WHERE MONTH(payment_date) = ? AND YEAR(payment_date) = ?
    `;

    db.query(query, [month, year], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results[0]);
    });
});


module.exports = router;
