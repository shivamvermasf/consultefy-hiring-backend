const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const router = express.Router();

// ✅ AWS S3 Client (Updated for AWS SDK v3)
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// ✅ Multer Setup (Stores Locally Before Uploading)
const upload = multer({ dest: 'uploads/' });

// ✅ File Upload Route
router.post('/resume', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            console.error("❌ No file received");
            return res.status(400).json({ success: false, message: 'File upload failed' });
        }

        console.log("📂 File Received:", req.file);

        const fileStream = fs.createReadStream(req.file.path);
        const fileKey = `resumes/${Date.now()}-${req.file.originalname}`;

        // Upload to S3 (No ACL setting)
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileKey,
            Body: fileStream,
            ContentType: req.file.mimetype
        };

        const command = new PutObjectCommand(uploadParams);
        await s3.send(command);

        console.log("✅ File Uploaded Successfully:", fileKey);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            fileUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
        });

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

    } catch (error) {
        console.error("❌ AWS S3 Upload Error:", error);
        res.status(500).json({ success: false, message: 'File upload to S3 failed', error });
    }
});

module.exports = router;
