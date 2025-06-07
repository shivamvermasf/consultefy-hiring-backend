// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config(); // Load environment variables

const db = require("./config/db"); // Import DB connection

const app = express();

// ✅ Define allowed origins for CORS
const allowedOrigins = [
  "http://localhost:3000", // Local frontend
  process.env.AWS_FRONTEND_URL, // AWS frontend URL (from .env)
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
        callback(null, true);
      } else {
        console.error("Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json()); // Parse JSON requests

// ✅ Test Route
app.get("/", (req, res) => {
  res.send(`🚀 Backend running in ${process.env.NODE_ENV} mode`);
});

// ✅ Import Routes
const candidateRoutes = require("./routes/candidateRoutes");
const opportunityRoutes = require("./routes/opportunityRoutes");
const { authRoutes, authenticate } = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const escalationRoutes = require("./routes/escalationRoutes");
const activityRoutes = require("./routes/activityRoutes");
const certificateRoutes = require("./routes/certificatesRoutes");
const candidateCertificateRoutes = require("./routes/candidateCertificatesRoutes");
const opportunityCandidateRoutes = require("./routes/opportunityCandidateRoutes");
const jobRoutes = require('./routes/jobRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');

// ✅ Import Admin Routes (for Technologies, Domains, and Skills)
const adminRoutes = require("./routes/adminRoutes");

// ✅ Apply Routes
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/candidates", authenticate, candidateRoutes);
app.use("/api/opportunity", authenticate, opportunityRoutes);
app.use("/api/payments", authenticate, paymentRoutes);
app.use("/api/escalations", authenticate, escalationRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/candidate-certificates", candidateCertificateRoutes);
app.use("/api/opportunity-candidates", authenticate, opportunityCandidateRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/attendance', authenticate, attendanceRoutes);
app.use('/api/invoices', invoiceRoutes);

// ✅ Apply Admin Routes
app.use("/api/admin", authenticate, adminRoutes);

// ✅ Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});
