const express = require('express');
const { authenticate } = require('./authRoutes');
const db = require('../config/db');
const PDFDocument = require('pdfkit');
const AWS = require('aws-sdk');
const router = express.Router();
const { generateAndStoreInvoice } = require('../services/invoiceService');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Helper: Generate PDF as Buffer
function generateInvoicePDF({ partner_company_id, jobs, month, year, totalAmount }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    doc.fontSize(20).text(`Invoice for Partner: ${partner_company_id}`, { align: 'center' });
    doc.moveDown();
    doc.text(`Month: ${month}/${year}`);
    doc.text(`Total Amount: $${totalAmount.toFixed(2)}`);
    doc.moveDown();

    jobs.forEach(job => {
      doc.fontSize(14).text(`Job: ${job.title || job.id} (Candidate: ${job.candidate_name})`);
      doc.fontSize(12).text(`Present Days: ${job.presentDays}, Total Hours: ${job.totalHours}, Amount: $${job.amount.toFixed(2)}`);
      doc.moveDown();
    });

    doc.end();
  });
}

// Helper: Upload to S3
async function uploadToS3(buffer, filename) {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `invoices/${filename}`,
    Body: buffer,
    ContentType: 'application/pdf',
    ACL: 'private',
  };
  const result = await s3.upload(params).promise();
  return result.Location;
}

// Main Route: Generate and Store Monthly Invoice
router.post('/generate-monthly', authenticate, async (req, res) => {
  const { partner_company_id, year, month } = req.body;

  if (!partner_company_id || !year || !month) {
    return res.status(400).json({ error: 'partner_company_id, year, and month are required' });
  }

  // 1. Find all jobs for this partner with attendance in this month
  const [jobs] = await db.promise().query(
    `SELECT DISTINCT j.*, c.name as candidate_name
     FROM jobs j
     JOIN candidates c ON j.candidate_id = c.id
     JOIN job_attendance a ON a.job_id = j.id
     WHERE j.partner_company = ? AND a.year = ? AND a.month = ?`,
    [partner_company_id, year, month]
  );

  if (!jobs.length) {
    return res.status(404).json({ error: 'No jobs with attendance found for this partner and month.' });
  }

  // 2. For each job, get attendance summary and calculate amount
  let totalAmount = 0;
  for (const job of jobs) {
    const [attendance] = await db.promise().query(
      `SELECT * FROM job_attendance WHERE job_id = ? AND year = ? AND month = ?`,
      [job.id, year, month]
    );
    job.presentDays = attendance.filter(a => a.status === 'present').length;
    job.totalHours = attendance.reduce((sum, a) => sum + parseFloat(a.hours_worked || 0), 0);
    // Example calculation: salary per day
    job.amount = job.presentDays * (job.candidate_salary / 22); // Adjust divisor as needed
    totalAmount += job.amount;
  }

  // 3. Generate PDF
  const pdfBuffer = await generateInvoicePDF({
    partner_company_id,
    jobs,
    month,
    year,
    totalAmount,
  });

  // 4. Upload PDF to S3
  const filename = `invoice_${partner_company_id}_${year}_${month}_${Date.now()}.pdf`;
  const s3_url = await uploadToS3(pdfBuffer, filename);

  // 5. Store invoice in DB
  console.log('Inserting invoice:', partner_company_id, year, month, totalAmount);

  const [invoiceResult] = await db.promise().query(
    `INSERT INTO invoices (partner_company_id, invoice_type, period_year, period_month, amount, s3_url)
     VALUES (?, 'monthly', ?, ?, ?, '')`,
    [partner_company_id, year, month, totalAmount]
  );

  console.log('Invoice insert result:', invoiceResult);
  const invoiceId = invoiceResult.insertId;

  // 6. Link jobs to invoice
  for (const job of jobs) {
    await db.promise().query(
      `INSERT INTO invoice_jobs (invoice_id, job_id) VALUES (?, ?)`,
      [invoiceId, job.id]
    );
  }

  res.json({
    success: true,
    invoiceId,
    s3_url,
    totalAmount,
    jobs: jobs.map(j => ({ id: j.id, candidate: j.candidate_name, amount: j.amount })),
  });
});

router.get('/job/:jobId/monthly', authenticate, async (req, res) => {
    const { jobId } = req.params;
    const { year, month } = req.query;

    // Fetch job and attendance
    const [jobRows] = await db.promise().query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    const [attendance] = await db.promise().query(
        `SELECT * FROM job_attendance WHERE job_id = ? AND year = ? AND month = ? ORDER BY day ASC`,
        [jobId, month, year]
    );

    // Calculate totals (customize as needed)
    const totalDays = attendance.length;
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const totalHours = attendance.reduce((sum, a) => sum + parseFloat(a.hours_worked || 0), 0);
    const salaryPerDay = job.candidate_salary / 22; // Example: 22 working days
    const totalSalary = presentDays * salaryPerDay;

    // Prepare invoice data
    const invoice = {
        job,
        attendance,
        summary: {
            totalDays,
            presentDays,
            totalHours,
            totalSalary,
            month,
            year
        }
    };

    res.json(invoice);
});

router.get('/job/:jobId/monthly/pdf', authenticate, async (req, res) => {
    const { jobId } = req.params;
    const { year, month } = req.query;

    // Fetch job and attendance
    const [jobRows] = await db.promise().query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    const [attendance] = await db.promise().query(
        `SELECT * FROM job_attendance WHERE job_id = ? AND year = ? AND month = ? ORDER BY day ASC`,
        [jobId, month, year]
    );

    // Calculate totals (customize as needed)
    const totalDays = attendance.length;
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const totalHours = attendance.reduce((sum, a) => sum + parseFloat(a.hours_worked || 0), 0);
    const salaryPerDay = job.candidate_salary / 22; // Example: 22 working days
    const totalSalary = presentDays * salaryPerDay;

    // Prepare invoice data
    const invoice = {
        job,
        attendance,
        summary: {
            totalDays,
            presentDays,
            totalHours,
            totalSalary,
            month,
            year
        }
    };

    // Set headers for download/preview
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=invoice.pdf');

    const doc = new PDFDocument();
    doc.pipe(res);

    doc.fontSize(20).text('Monthly Invoice', { align: 'center' });
    doc.moveDown();
    doc.text(`Job: ${invoice.job.title}`);
    doc.text(`Month: ${invoice.summary.month}/${invoice.summary.year}`);
    doc.text(`Total Days: ${invoice.summary.totalDays}`);
    doc.text(`Present Days: ${invoice.summary.presentDays}`);
    doc.text(`Total Hours: ${invoice.summary.totalHours}`);
    doc.text(`Total Salary: ${invoice.summary.totalSalary.toFixed(2)}`);
    doc.moveDown();

    doc.text('Attendance Details:');
    invoice.attendance.forEach(a => {
        doc.text(`Day ${a.day}: ${a.status}, Hours: ${a.hours_worked}`);
    });

    doc.end();
});

router.get('/monthly', authenticate, async (req, res) => {
    const { year, month } = req.query;

    // 1. Find all jobs with attendance in this month
    const [jobs] = await db.promise().query(
        `SELECT DISTINCT j.*, c.name as candidate_name, c.email as candidate_email
         FROM jobs j
         JOIN candidates c ON j.candidate_id = c.id
         JOIN job_attendance a ON a.job_id = j.id
         WHERE a.year = ? AND a.month = ?`,
        [year, month]
    );

    // 2. For each job, get attendance summary
    const invoices = [];
    for (const job of jobs) {
        const [attendance] = await db.promise().query(
            `SELECT * FROM job_attendance WHERE job_id = ? AND year = ? AND month = ? ORDER BY day ASC`,
            [job.id, year, month]
        );
        const presentDays = attendance.filter(a => a.status === 'present').length;
        const totalHours = attendance.reduce((sum, a) => sum + parseFloat(a.hours_worked || 0), 0);
        const salaryPerDay = job.candidate_salary / 22; // Example: 22 working days
        const totalSalary = presentDays * salaryPerDay;

        invoices.push({
            job,
            candidate: { name: job.candidate_name, email: job.candidate_email },
            attendance,
            summary: {
                presentDays,
                totalHours,
                totalSalary,
                month,
                year
            }
        });
    }

    res.json({ invoices });
});

router.get('/monthly/pdf', authenticate, async (req, res) => {
    const { year, month } = req.query;

    // Fetch all invoice data as above
    // ... (reuse the code from the previous endpoint) ...

    // Set headers for download/preview
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=all_invoices.pdf');

    const doc = new PDFDocument();
    doc.pipe(res);

    for (const invoice of invoices) {
        doc.addPage();
        doc.fontSize(20).text('Monthly Invoice', { align: 'center' });
        doc.moveDown();
        doc.text(`Candidate: ${invoice.candidate.name} (${invoice.candidate.email})`);
        doc.text(`Job: ${invoice.job.title || invoice.job.id}`);
        doc.text(`Month: ${invoice.summary.month}/${invoice.summary.year}`);
        doc.text(`Present Days: ${invoice.summary.presentDays}`);
        doc.text(`Total Hours: ${invoice.summary.totalHours}`);
        doc.text(`Total Salary: ${invoice.summary.totalSalary.toFixed(2)}`);
        doc.moveDown();
        doc.text('Attendance Details:');
        invoice.attendance.forEach(a => {
            doc.text(`Day ${a.day}: ${a.status}, Hours: ${a.hours_worked}`);
        });
        doc.addPage();
    }

    doc.end();
});

router.post('/generate', async (req, res) => {
  try {
    const { year, month, job_ids } = req.body;
    const result = await generateAndStoreInvoice({ year, month, job_ids });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router; 