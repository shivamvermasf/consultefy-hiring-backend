const express = require('express');
const { authenticate } = require('./authRoutes');
const db = require('../config/db');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Constants for overtime calculations
const WEEKEND_RATE_MULTIPLIER = 2.0;  // 2x for weekend work
const HOLIDAY_RATE_MULTIPLIER = 2.0;  // 2x for holiday work
const OVERTIME_RATE_MULTIPLIER = 1.5;  // 1.5x for extra hours

// Get all jobs with detailed information
router.get('/', authenticate, (req, res) => {
    db.query(`
        SELECT 
            j.*,
            o.title as opportunity_title,
            c.name as candidate_name,
            c.email as candidate_email
        FROM jobs j 
        JOIN opportunity o ON j.opportunity_id = o.id 
        JOIN candidates c ON j.candidate_id = c.id
        ORDER BY j.created_at DESC
    `, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// Get a specific job with detailed information
router.get('/:id', authenticate, (req, res) => {
    db.query(
        `SELECT 
            j.*,
            o.title as opportunity_title,
            c.name as candidate_name,
            c.email as candidate_email
        FROM jobs j 
        JOIN opportunity o ON j.opportunity_id = o.id 
        JOIN candidates c ON j.candidate_id = c.id 
        WHERE j.id = ?`,
        [req.params.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err });
            if (results.length === 0) return res.status(404).json({ message: 'Job not found' });
            res.json(results[0]);
        }
    );
});

// Create a new job
router.post('/', authenticate, [
    body('opportunity_id').isInt().notEmpty(),
    body('candidate_id').isInt().notEmpty(),
    body('client_company').notEmpty(),
    body('candidate_salary').isFloat({ min: 0 }),
    body('client_billing_amount').isFloat({ min: 0 }),
    body('start_date').isDate(),
    body('payment_frequency').isIn(['monthly', 'bi-weekly', 'weekly']),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const {
        opportunity_id,
        candidate_id,
        client_company,
        partner_company,
        candidate_salary,
        client_billing_amount,
        start_date,
        end_date,
        payment_frequency,
        payment_currency,
        notes
    } = req.body;

    db.query(
        `INSERT INTO jobs (
            opportunity_id,
            candidate_id,
            client_company,
            partner_company,
            candidate_salary,
            client_billing_amount,
            start_date,
            end_date,
            payment_frequency,
            payment_currency,
            notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            opportunity_id,
            candidate_id,
            client_company,
            partner_company,
            candidate_salary,
            client_billing_amount,
            start_date,
            end_date,
            payment_frequency,
            payment_currency || 'USD',
            notes
        ],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            
            // Update opportunity status to filled
            db.query(
                'UPDATE opportunity SET status = "filled" WHERE id = ?',
                [opportunity_id],
                (err, updateResult) => {
                    if (err) return res.status(500).json({ error: err });
                    res.json({ 
                        success: true, 
                        message: 'Job created successfully',
                        job_id: result.insertId 
                    });
                }
            );
        }
    );
});

// Update job details
router.put('/:id', authenticate, [
    body('candidate_salary').optional().isFloat({ min: 0 }),
    body('client_billing_amount').optional().isFloat({ min: 0 }),
    body('start_date').optional().isDate(),
    body('end_date').optional().isDate(),
    body('payment_frequency').optional().isIn(['monthly', 'bi-weekly', 'weekly']),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const updateFields = {};
    const allowedFields = [
        'client_company',
        'partner_company',
        'candidate_salary',
        'client_billing_amount',
        'start_date',
        'end_date',
        'payment_frequency',
        'payment_currency',
        'notes',
        'status'
    ];

    // Build update object from allowed fields
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updateFields[field] = req.body[field];
        }
    });

    if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    const query = 'UPDATE jobs SET ? WHERE id = ?';
    db.query(query, [updateFields, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Job not found' });
        res.json({ success: true, message: 'Job updated successfully' });
    });
});

// Get job financial summary
router.get('/:id/financial-summary', authenticate, (req, res) => {
    db.query(`
        SELECT 
            id,
            client_company,
            partner_company,
            candidate_salary,
            client_billing_amount,
            (client_billing_amount - candidate_salary) as profit_margin,
            ((client_billing_amount - candidate_salary) / client_billing_amount * 100) as profit_percentage,
            payment_frequency,
            payment_currency,
            start_date,
            end_date,
            DATEDIFF(COALESCE(end_date, CURRENT_DATE), start_date) as days_duration
        FROM jobs 
        WHERE id = ?
    `, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Job not found' });
        res.json(results[0]);
    });
});

// Get active jobs summary
router.get('/summary/active', authenticate, (req, res) => {
    db.query(`
        SELECT 
            COUNT(*) as total_active_jobs,
            SUM(client_billing_amount) as total_billing_amount,
            SUM(candidate_salary) as total_salary_cost,
            SUM(client_billing_amount - candidate_salary) as total_profit,
            AVG((client_billing_amount - candidate_salary) / client_billing_amount * 100) as avg_profit_percentage
        FROM jobs 
        WHERE status = 'active'
    `, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results[0]);
    });
});

// Record job attendance with overtime
router.post('/attendance', authenticate, async (req, res) => {
    const {
        job_id,
        year,
        month,
        regular_days_worked,
        weekend_days_worked,
        holiday_days_worked,
        leaves_taken,
        overtime_hours,
        notes
    } = req.body;

    try {
        // Get monthly working days
        const [monthData] = await db.promise().query(
            'SELECT working_days FROM monthly_workdays WHERE year = ? AND month = ?',
            [year, month]
        );

        if (monthData.length === 0) {
            return res.status(400).json({
                error: 'Monthly working days not set for this period'
            });
        }

        if (regular_days_worked > monthData[0].working_days) {
            return res.status(400).json({
                error: 'Regular days worked cannot exceed total working days in the month'
            });
        }

        const query = `
            INSERT INTO job_attendance 
            (job_id, year, month, regular_days_worked, weekend_days_worked, 
             holiday_days_worked, leaves_taken, overtime_hours, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            regular_days_worked = VALUES(regular_days_worked),
            weekend_days_worked = VALUES(weekend_days_worked),
            holiday_days_worked = VALUES(holiday_days_worked),
            leaves_taken = VALUES(leaves_taken),
            overtime_hours = VALUES(overtime_hours),
            notes = VALUES(notes),
            updated_at = CURRENT_TIMESTAMP
        `;

        await db.promise().query(query, [
            job_id, year, month, regular_days_worked, weekend_days_worked,
            holiday_days_worked, leaves_taken, overtime_hours, notes
        ]);

        res.json({
            success: true,
            message: 'Job attendance recorded successfully'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Calculate monthly compensation (helper function)
const calculateMonthlyCompensation = (baseAmount, attendance, workingDays, isHourlyRate = false) => {
    const baseDaily = isHourlyRate 
        ? baseAmount * 8  // 8 hours per day
        : baseAmount / workingDays;

    // Regular days compensation
    const regularCompensation = baseDaily * attendance.regular_days_worked;

    // Weekend work compensation
    const weekendCompensation = baseDaily * attendance.weekend_days_worked * WEEKEND_RATE_MULTIPLIER;

    // Holiday work compensation
    const holidayCompensation = baseDaily * attendance.holiday_days_worked * HOLIDAY_RATE_MULTIPLIER;

    // Overtime compensation
    const hourlyRate = isHourlyRate ? baseAmount : baseDaily / 8;
    const overtimeCompensation = hourlyRate * attendance.overtime_hours * OVERTIME_RATE_MULTIPLIER;

    return {
        regular: regularCompensation,
        weekend: weekendCompensation,
        holiday: holidayCompensation,
        overtime: overtimeCompensation,
        total: regularCompensation + weekendCompensation + holidayCompensation + overtimeCompensation
    };
};

// Generate invoice with overtime calculations
router.post('/invoice/generate/:jobId/:year/:month', authenticate, async (req, res) => {
    const { jobId, year, month } = req.params;

    try {
        // Get job details
        const [jobs] = await db.promise().query(
            'SELECT * FROM jobs WHERE id = ?',
            [jobId]
        );
        const job = jobs[0];

        // Get attendance and working days
        const [attendanceData] = await db.promise().query(
            `SELECT ja.*, mw.working_days as total_working_days
             FROM job_attendance ja
             JOIN monthly_workdays mw ON ja.year = mw.year AND ja.month = mw.month
             WHERE ja.job_id = ? AND ja.year = ? AND ja.month = ?`,
            [jobId, year, month]
        );

        if (attendanceData.length === 0) {
            return res.status(400).json({
                error: 'Attendance record not found for this period'
            });
        }

        const attendance = attendanceData[0];

        // Calculate candidate compensation
        const candidateCompensation = calculateMonthlyCompensation(
            job.payment_frequency === 'monthly' ? job.candidate_salary : job.hourly_rate,
            attendance,
            attendance.total_working_days,
            job.payment_frequency !== 'monthly'
        );

        // Calculate client billing
        const clientBilling = calculateMonthlyCompensation(
            job.payment_frequency === 'monthly' ? job.client_billing_amount : job.hourly_rate,
            attendance,
            attendance.total_working_days,
            job.payment_frequency !== 'monthly'
        );

        // Calculate commission and profit
        const totalCommission = job.commission_percentage 
            ? (clientBilling.total * job.commission_percentage / 100)
            : 0;
        
        const netProfit = clientBilling.total - candidateCompensation.total - totalCommission;

        // Create invoice record
        const invoiceQuery = `
            INSERT INTO job_monthly_invoices (
                job_id, year, month,
                regular_days_billed, weekend_days_billed, holiday_days_billed,
                overtime_hours_billed,
                regular_amount, weekend_amount, holiday_amount, overtime_amount,
                total_billing_amount,
                regular_salary, weekend_salary, holiday_salary, overtime_salary,
                total_salary_amount,
                total_commission, net_profit
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.promise().query(invoiceQuery, [
            jobId, year, month,
            attendance.regular_days_worked,
            attendance.weekend_days_worked,
            attendance.holiday_days_worked,
            attendance.overtime_hours,
            clientBilling.regular,
            clientBilling.weekend,
            clientBilling.holiday,
            clientBilling.overtime,
            clientBilling.total,
            candidateCompensation.regular,
            candidateCompensation.weekend,
            candidateCompensation.holiday,
            candidateCompensation.overtime,
            candidateCompensation.total,
            totalCommission,
            netProfit
        ]);

        res.json({
            success: true,
            invoice_details: {
                period: { year, month },
                attendance: {
                    regular_days: attendance.regular_days_worked,
                    weekend_days: attendance.weekend_days_worked,
                    holiday_days: attendance.holiday_days_worked,
                    overtime_hours: attendance.overtime_hours,
                    leaves_taken: attendance.leaves_taken
                },
                billing: clientBilling,
                salary: candidateCompensation,
                commission: totalCommission,
                net_profit: netProfit
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get attendance details
router.get('/attendance/:jobId/:year/:month', authenticate, async (req, res) => {
    const { jobId, year, month } = req.params;
    
    try {
        const [attendance] = await db.promise().query(
            `SELECT ja.*, mw.working_days as total_working_days
             FROM job_attendance ja
             JOIN monthly_workdays mw ON ja.year = mw.year AND ja.month = mw.month
             WHERE ja.job_id = ? AND ja.year = ? AND ja.month = ?`,
            [jobId, year, month]
        );
        
        res.json(attendance[0] || null);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get job finance details
router.get('/:id/finance', authenticate, async (req, res) => {
    try {
        // First check if job exists without joins
        const [jobCheck] = await db.promise().query(
            'SELECT * FROM jobs WHERE id = ?',
            [req.params.id]
        );

        if (jobCheck.length === 0) {
            return res.status(404).json({ 
                message: 'Job not found',
                detail: 'No job record exists with this ID'
            });
        }

        // Now try to get the full job details with joins
        const [jobs] = await db.promise().query(
            `SELECT 
                j.*,
                o.title as opportunity_title,
                c.name as candidate_name,
                c.email as candidate_email
            FROM jobs j 
            LEFT JOIN opportunity o ON j.opportunity_id = o.id 
            LEFT JOIN candidates c ON j.candidate_id = c.id 
            WHERE j.id = ?`,
            [req.params.id]
        );

        const job = jobs[0];

        // Get all monthly invoices for this job
        const [invoices] = await db.promise().query(
            `SELECT * FROM job_monthly_invoices 
             WHERE job_id = ?
             ORDER BY year DESC, month DESC`,
            [req.params.id]
        );

        // Get attendance records
        const [attendance] = await db.promise().query(
            `SELECT ja.*, mw.working_days as total_working_days
             FROM job_attendance ja
             LEFT JOIN monthly_workdays mw ON ja.year = mw.year AND ja.month = mw.month
             WHERE ja.job_id = ?
             ORDER BY ja.year DESC, ja.month DESC`,
            [req.params.id]
        );

        // Calculate totals
        const financialSummary = {
            total_billing: invoices.reduce((sum, inv) => sum + inv.total_billing_amount, 0),
            total_salary: invoices.reduce((sum, inv) => sum + inv.total_salary_amount, 0),
            total_commission: invoices.reduce((sum, inv) => sum + inv.total_commission, 0),
            total_profit: invoices.reduce((sum, inv) => sum + inv.net_profit, 0),
            average_monthly_profit: invoices.length > 0 
                ? invoices.reduce((sum, inv) => sum + inv.net_profit, 0) / invoices.length 
                : 0
        };

        res.json({
            job_details: {
                id: job.id,
                opportunity_title: job.opportunity_title || 'No opportunity linked',
                candidate_name: job.candidate_name || 'No candidate linked',
                client_company: job.client_company,
                partner_company: job.partner_company,
                start_date: job.start_date,
                end_date: job.end_date,
                status: job.status,
                payment_frequency: job.payment_frequency,
                payment_currency: job.payment_currency,
                candidate_salary: job.candidate_salary,
                client_billing_amount: job.client_billing_amount
            },
            financial_summary: financialSummary,
            monthly_invoices: invoices,
            attendance_records: attendance
        });
    } catch (error) {
        console.error('Error fetching job finance details:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;