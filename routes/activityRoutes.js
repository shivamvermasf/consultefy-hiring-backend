// routes/activityRoutes.js
const express = require('express');
const db = require('../config/db');
const { authenticate } = require('./authRoutes');
const router = express.Router();

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
