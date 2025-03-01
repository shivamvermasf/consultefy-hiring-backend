const db = require('./db');

const createEscalationsTable = `
    CREATE TABLE IF NOT EXISTS escalations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        job_id INT NOT NULL,
        reason TEXT NOT NULL,
        escalation_date DATE NOT NULL,
        resolution TEXT NULL,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
`;

db.query(createEscalationsTable, (err, result) => {
    if (err) {
        console.error('❌ Error creating escalations table:', err);
        return;
    }
    console.log('✅ Escalations table created successfully');
});

db.end();
