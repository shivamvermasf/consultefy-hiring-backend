const PDFDocument = require('pdfkit');
const AWS = require('aws-sdk');
const db = require('../config/db');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Generate PDF as Buffer
function generateInvoicePDF({ jobs, month, year, totalAmount, partner_company_id }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    doc.fontSize(20).text(`Invoice for Partner: ${partner_company_id}`, { align: 'center' });
    doc.moveDown();
    doc.text(`Month: ${month}/${year}`);
    doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`);
    doc.moveDown();

    doc.fontSize(14).text('Job Summary:', { underline: true });
    doc.moveDown(0.5);

    jobs.forEach(job => {
      doc.fontSize(12).text(
        `Job: ${job.id} | Candidate: ${job.candidate_name || job.candidate_id} | Company: ${job.client_company}`
      );
      doc.text(`Present Days: ${job.presentDays}, Amount: ₹${job.amount.toFixed(2)}`);
      doc.moveDown();
    });

    doc.end();
  });
}

// Upload to S3
async function uploadToS3(buffer, filename) {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `invoices/${filename}`,
    Body: buffer,
    ContentType: 'application/pdf',
    ACL: 'private',
  };
  const result = await s3.upload(params).promise();
  return result.Location;
}

// Main logic for generating and storing invoice
async function generateAndStoreInvoice({ year, month, job_ids }) {
  if (!year || !month || !Array.isArray(job_ids) || job_ids.length === 0) {
    throw new Error('year, month, and job_ids[] are required');
  }

  // 1. Fetch jobs by IDs
  const [jobs] = await db.promise().query(
    `SELECT j.*, c.name as candidate_name
     FROM jobs j
     JOIN candidates c ON j.candidate_id = c.id
     WHERE j.id IN (${job_ids.map(() => '?').join(',')})`,
    job_ids
  );
  if (!jobs.length) {
    throw new Error('No jobs found for the provided IDs.');
  }

  // Use the partner_company from the first job (assuming all jobs are for the same partner)
  const partner_company_id = jobs[0].partner_company;

  // 2. For each job, fetch attendance and calculate amount
  let totalAmount = 0;
  for (const job of jobs) {
    const [attendance] = await db.promise().query(
      `SELECT * FROM job_attendance WHERE job_id = ? AND year = ? AND month = ?`,
      [job.id, year, month]
    );
    job.presentDays = attendance.filter(a => a.status === 'present').length;
    // Example: per-day rate
    const perDayRate = parseFloat(job.candidate_salary) / 22; // Adjust as needed
    job.amount = job.presentDays * perDayRate;
    totalAmount += job.amount;
  }

  // 3. Create invoice record (with empty S3 URL at first)
  const [invoiceResult] = await db.promise().query(
    `INSERT INTO invoices (partner_company_id, invoice_type, period_year, period_month, amount, s3_url)
     VALUES (?, 'monthly', ?, ?, ?, '')`,
    [partner_company_id, year, month, totalAmount]
  );
  const invoiceId = invoiceResult.insertId;

  // 4. Create invoice_jobs records
  for (const job of jobs) {
    await db.promise().query(
      `INSERT INTO invoice_jobs (invoice_id, job_id) VALUES (?, ?)`,
      [invoiceId, job.id]
    );
  }

  // 5. Generate PDF (summary only)
  const pdfBuffer = await generateInvoicePDF({
    jobs,
    month,
    year,
    totalAmount,
    partner_company_id,
  });

  // 6. Upload PDF to S3 (invoices folder)
  const filename = `invoice_${partner_company_id}_${year}_${month}_${invoiceId}.pdf`;
  const s3_url = await uploadToS3(pdfBuffer, filename);

  // 7. Update invoice record with S3 URL
  await db.promise().query(
    `UPDATE invoices SET s3_url = ? WHERE id = ?`,
    [s3_url, invoiceId]
  );

  // 8. Return invoice info
  return {
    invoiceId,
    s3_url,
    totalAmount,
    jobs: jobs.map(j => ({
      id: j.id,
      candidate: j.candidate_name,
      presentDays: j.presentDays,
      amount: j.amount,
    })),
  };
}

module.exports = {
  generateAndStoreInvoice,
}; 