// routes/activityRoutes.js
const express = require('express');
const db = require('../config/db');
const { authenticate } = require('./authRoutes');
const router = express.Router();

// GET activities for a specific parent ID
router.get('/:parentId', authenticate, async (req, res) => {
  try {
    const { parentId } = req.params;
    console.log('Fetching activities for parent ID:', parentId);

    const [results] = await db.promise().query(
      `SELECT 
        a.*,
        COALESCE(u.name, 'System') as user_name 
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.parent_id = ?
       ORDER BY a.created_at DESC`,
      [parentId]
    );

    console.log(`Found ${results.length} activities for parent ID ${parentId}`);
    res.json(results);
  } catch (err) {
    console.error('Error fetching activities:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET recent activities
router.get('/recent', authenticate, async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT a.*, u.name as user_name 
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 50`
    );
    res.json(results);
  } catch (err) {
    console.error('Error fetching recent activities:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET all activities for a given parent (e.g., Candidate, User, Payment)
router.get('/parent/:parentType/:parentId', authenticate, (req, res) => {
  const { parentType, parentId } = req.params;
  db.query(
    'SELECT * FROM activities WHERE parent_type = ? AND parent_id = ?',
    [parentType, parentId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results);
    }
  );
});

// GET overdue activities (due date has passed)
router.get('/overdue', authenticate, async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT a.*, u.name as user_name 
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.due_date < CURDATE() 
       AND a.status != 'completed'
       ORDER BY a.due_date ASC`
    );
    res.json(results);
  } catch (err) {
    console.error('Error fetching overdue activities:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET upcoming activities (due in next 7 days)
router.get('/upcoming', authenticate, async (req, res) => {
  try {
    console.log('Fetching upcoming activities...');
    const [results] = await db.promise().query(
      `SELECT a.*, u.name as user_name 
       FROM activities a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       AND a.status != 'completed'
       ORDER BY a.due_date ASC`
    );
    console.log(`Found ${results.length} upcoming activities`);
    res.json(results);
  } catch (err) {
    console.error('Error fetching upcoming activities:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Create a new activity for any parent
router.post('/', authenticate, (req, res) => {
  const {
    parent_type,
    parent_id,
    activity_type,
    subject,
    description,
    status,
    due_date,
    start_time,
    end_time,
    location,
    call_duration,
    email_recipients,
    cc,
    bcc,
    attachments,
    additional_info,
  } = req.body;
  
  db.query(
    `INSERT INTO activities 
      (parent_type, parent_id, activity_type, subject, description, status, due_date, start_time, end_time, location, call_duration, email_recipients, cc, bcc, attachments, additional_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parent_type,
      parent_id,
      activity_type,
      subject,
      description,
      status,
      due_date,
      start_time,
      end_time,
      location,
      call_duration,
      email_recipients,
      cc,
      bcc,
      JSON.stringify(attachments),
      JSON.stringify(additional_info)
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ success: true, id: result.insertId });
    }
  );
});

// PUT: Update an existing activity
router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const {
    subject,
    description,
    status,
    due_date,
    start_time,
    end_time,
    location,
    call_duration,
    email_recipients,
    cc,
    bcc,
    attachments,
    additional_info,
  } = req.body;
  
  db.query(
    `UPDATE activities 
      SET subject = ?, description = ?, status = ?, due_date = ?, start_time = ?, end_time = ?, location = ?, call_duration = ?, email_recipients = ?, cc = ?, bcc = ?, attachments = ?, additional_info = ?
      WHERE id = ?`,
    [
      subject,
      description,
      status,
      due_date,
      start_time,
      end_time,
      location,
      call_duration,
      email_recipients,
      cc,
      bcc,
      JSON.stringify(attachments),
      JSON.stringify(additional_info),
      id
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ success: true, message: 'Activity updated successfully' });
    }
  );
});

// DELETE: Remove an activity
router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM activities WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ success: true, message: 'Activity deleted successfully' });
  });
});

module.exports = router;
