const express = require('express');
const router = express.Router();
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const Document = require('../models/Document');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const upload = multer({ storage: multer.memoryStorage() });

// Get documents for an entity
router.get('/:entityType/:entityId', auth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const documents = await Document.find({
      entityType,
      entityId
    }).sort({ created_at: -1 });
    res.json(documents);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload a document
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { entityType, entityId, name } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Create folder if it doesn't exist
    const folderKey = `${entityType}/`;
    try {
      await s3.headObject({ Bucket: process.env.AWS_BUCKET_NAME, Key: folderKey }).promise();
    } catch (err) {
      if (err.code === 'NotFound') {
        await s3.putObject({ Bucket: process.env.AWS_BUCKET_NAME, Key: folderKey }).promise();
      }
    }

    // Generate unique file name
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const fileKey = `${entityType}/${fileName}`;

    // Upload to S3
    await s3.upload({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype
    }).promise();

    // Save document metadata to database
    const document = new Document({
      name: name || file.originalname,
      entityType,
      entityId,
      fileKey,
      fileUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`,
      fileType: file.mimetype,
      fileSize: file.size
    });

    await document.save();
    res.json(document);
  } catch (err) {
    console.error('Error uploading document:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Download a document
router.get('/:documentId/download', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const s3Object = await s3.getObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: document.fileKey
    }).promise();

    res.setHeader('Content-Type', document.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.name}"`);
    res.send(s3Object.Body);
  } catch (err) {
    console.error('Error downloading document:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a document
router.delete('/:documentId', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Delete from S3
    await s3.deleteObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: document.fileKey
    }).promise();

    // Delete from database
    await document.remove();
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 