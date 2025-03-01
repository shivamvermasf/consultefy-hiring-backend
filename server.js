// Import required modules
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

const db = require('./config/db'); // Import DB connection
dotenv.config(); // Load environment variables from .env file

const app = express();

// ✅ Middleware
app.use(cors({ origin: "http://localhost:3000" })); // Enable CORS for React frontend
app.use(express.json()); // Parse JSON requests

// ✅ Simple Test Route
app.get('/', (req, res) => {
    res.send('Freelance Recruiting App Backend is Running!');
});

// ✅ Import Routes
const candidateRoutes = require('./routes/candidateRoutes');
const jobRoutes = require('./routes/jobRoutes');
const { authRoutes, authenticate } = require('./routes/authRoutes'); // Import `authenticate`
const uploadRoutes = require('./routes/uploadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const escalationRoutes = require('./routes/escalationRoutes');

// ✅ Apply Routes (DO NOT protect `/api/auth`)
app.use('/api/auth', authRoutes); // 🚨 Login & Register should NOT require authentication
app.use('/api/upload', uploadRoutes); // File uploads do not need authentication

// ✅ Protect These Routes (Require Authentication)
app.use('/api/candidates', authenticate, candidateRoutes);
app.use('/api/jobs', authenticate, jobRoutes);
app.use('/api/payments', authenticate, paymentRoutes);
app.use('/api/escalations', authenticate, escalationRoutes);

// ✅ Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
