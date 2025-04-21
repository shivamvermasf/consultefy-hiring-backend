const express = require('express');
const { authenticate } = require('./authRoutes');
const db = require('../config/db');
const router = express.Router();

// Constants
const OVERTIME_RATE_MULTIPLIER = 1.5;  // 1.5x for overtime hours
const STANDARD_WORK_HOURS = 8.0;       // Standard work hours per day

// Helper function to validate date components
const validateDate = (day, month, year) => {
    // Convert to numbers
    day = parseInt(day);
    month = parseInt(month);
    year = parseInt(year);

    // Basic validation
    if (month < 1 || month > 12) {
        return { isValid: false, error: 'Month must be between 1 and 12' };
    }

    // Get last day of the month
    const lastDay = new Date(year, month, 0).getDate();
    if (day < 1 || day > lastDay) {
        return { isValid: false, error: `Day must be between 1 and ${lastDay} for month ${month}` };
    }

    // Validate year (optional: adjust range as needed)
    const currentYear = new Date().getFullYear();
    if (year < 2020 || year > currentYear + 1) {
        return { isValid: false, error: `Year must be between 2020 and ${currentYear + 1}` };
    }

    return { isValid: true, day, month, year };
};

// Create or update attendance with composite key in URL
router.post('/:jobId([0-9]+)_:year([0-9]+)_:month([0-9]+)_:day([0-9]+)', authenticate, async (req, res) => {
    // Extract values from URL parameters
    const {
        jobId,
        year,
        month,
        day
    } = req.params;

    // Merge URL params with body data
    const data = {
        ...req.body,
        job_id: jobId,
        year: parseInt(year),
        month: parseInt(month),
        day: parseInt(day)
    };

    try {
        // Validate date components
        const dateValidation = validateDate(data.day, data.month, data.year);
        if (!dateValidation.isValid) {
            return res.status(400).json({
                error: dateValidation.error
            });
        }

        // Verify if job exists
        const [jobs] = await db.promise().query(
            'SELECT * FROM jobs WHERE id = ?',
            [data.job_id]
        );

        if (jobs.length === 0) {
            return res.status(404).json({
                error: 'Job not found'
            });
        }

        // Validate status
        const validStatuses = ['present', 'absent', 'half_day', 'leave', 'holiday', 'weekend'];
        if (data.status && !validStatuses.includes(data.status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Check if attendance already exists for this job and date
        const [existingAttendance] = await db.promise().query(
            `SELECT * FROM job_attendance 
             WHERE job_id = ? AND day = ? AND month = ? AND year = ?`,
            [data.job_id, data.day, data.month, data.year]
        );

        if (existingAttendance.length > 0) {
            // Update existing attendance
            const updateQuery = `
                UPDATE job_attendance 
                SET status = ?,
                    time_in = ?,
                    time_out = ?,
                    hours_worked = ?,
                    notes = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            await db.promise().query(updateQuery, [
                data.status || existingAttendance[0].status,
                data.time_in,
                data.time_out,
                data.hours_worked || 0,
                data.notes || '',
                existingAttendance[0].id
            ]);

            // Get the updated attendance record
            const [attendance] = await db.promise().query(
                'SELECT * FROM job_attendance WHERE id = ?',
                [existingAttendance[0].id]
            );

            return res.json({
                success: true,
                message: 'Attendance updated successfully',
                data: attendance[0]
            });
        } else {
            // Create new attendance record
            const createQuery = `
                INSERT INTO job_attendance 
                (job_id, day, month, year, status, time_in, time_out, hours_worked, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const [result] = await db.promise().query(createQuery, [
                data.job_id,
                data.day,
                data.month,
                data.year,
                data.status || 'present',
                data.time_in,
                data.time_out,
                data.hours_worked || 0,
                data.notes || ''
            ]);

            // Get the created attendance record
            const [attendance] = await db.promise().query(
                'SELECT * FROM job_attendance WHERE id = ?',
                [result.insertId]
            );

            return res.json({
                success: true,
                message: 'Attendance created successfully',
                data: attendance[0]
            });
        }
    } catch (error) {
        console.error('Error managing attendance:', error);
        res.status(500).json({ 
            error: error.message,
            detail: 'An error occurred while managing attendance'
        });
    }
});

// Get attendance by ID
router.get('/:id', authenticate, async (req, res) => {
    try {
        const [attendance] = await db.promise().query(
            'SELECT * FROM job_attendance WHERE id = ?',
            [req.params.id]
        );
        
        if (attendance.length === 0) {
            return res.status(404).json({ 
                error: 'Attendance record not found',
                message: 'Use POST to create a new attendance record with this ID'
            });
        }
        
        res.json(attendance[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get monthly attendance for a job
router.get('/job/:jobId/monthly', authenticate, async (req, res) => {
    const { jobId } = req.params;
    let { 
        month = new Date().getMonth() + 1,
        year = new Date().getFullYear()
    } = req.query;

    try {
        // Convert to integers
        month = parseInt(month);
        year = parseInt(year);
        const jobIdInt = parseInt(jobId);

        // Validate the values
        if (isNaN(month) || month < 1 || month > 12) {
            return res.status(400).json({ error: 'Invalid month' });
        }
        if (isNaN(year) || year < 2020 || year > 2100) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        if (isNaN(jobIdInt)) {
            return res.status(400).json({ error: 'Invalid job ID' });
        }

        // Get attendance records
        const [attendance] = await db.promise().query(
            `SELECT * FROM job_attendance 
             WHERE job_id = ? AND month = ? AND year = ?
             ORDER BY day ASC`,
            [jobIdInt, month, year]
        );

        console.log('Query params:', { jobId: jobIdInt, month, year }); // Debug log
        console.log('Found attendance records:', attendance.length); // Debug log

        // Calculate summary
        const summary = {
            total_days: attendance.length,
            present_days: attendance.filter(a => a.status === 'present').length,
            absent_days: attendance.filter(a => a.status === 'absent').length,
            half_days: attendance.filter(a => a.status === 'half_day').length,
            leaves: attendance.filter(a => a.status === 'leave').length,
            holidays: attendance.filter(a => a.status === 'holiday').length,
            weekends: attendance.filter(a => a.status === 'weekend').length,
            total_hours: attendance.reduce((sum, a) => sum + parseFloat(a.hours_worked || 0), 0)
        };

        // Get the total working days in the month
        const totalDays = new Date(year, month, 0).getDate();
        
        // Add missing days as absent
        const allDays = [];
        for (let day = 1; day <= totalDays; day++) {
            const existingRecord = attendance.find(a => a.day === day);
            if (existingRecord) {
                allDays.push(existingRecord);
            }
        }
        
        res.json({
            success: true,
            month,
            year,
            summary,
            attendance: allDays
        });
    } catch (error) {
        console.error('Error fetching monthly attendance:', error);
        res.status(500).json({ 
            error: error.message,
            detail: 'An error occurred while fetching monthly attendance'
        });
    }
});

// Get attendance by date
router.get('/job/:jobId/date', authenticate, async (req, res) => {
    const { jobId } = req.params;
    const { day, month, year } = req.query;

    try {
        const [attendance] = await db.promise().query(
            `SELECT * FROM job_attendance 
             WHERE job_id = ? AND day = ? AND month = ? AND year = ?`,
            [jobId, day, month, year]
        );
        
        if (attendance.length === 0) {
            return res.status(404).json({ 
                error: 'Attendance record not found'
            });
        }
        
        res.json(attendance[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a helper route to debug the database content
router.get('/debug/all', authenticate, async (req, res) => {
    try {
        const [allRecords] = await db.promise().query(
            'SELECT * FROM job_attendance ORDER BY year, month, day'
        );
        
        res.json({
            success: true,
            count: allRecords.length,
            records: allRecords
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;