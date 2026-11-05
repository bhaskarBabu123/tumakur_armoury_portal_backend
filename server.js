const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// Security middleware

/* Security middleware */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

app.use(compression());


// // Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use('/api/', limiter);

// CORS configuration
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if ("development" === 'development') {
  app.use(morgan('dev'));
}

// Static files
// Only profile images are public. Supporting reports and return documents are private.
app.use('/uploads/profiles', express.static(path.join(__dirname, 'uploads', 'profiles')));

// Database connection
// if ("") {
//   console.error('❌ MONGODB_URI is missing. Add it to backend/.env');
//   process.exit(1);
// }

mongoose.connect("mongodb+srv://smartinfotechsolutions3_db_user:uS0p9Ihni0OPXRmU@armoury.eismiof.mongodb.net/armoury_main?retryWrites=true&w=majority", {
  serverSelectionTimeoutMS: 15000,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  createAdminUser();
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Create admin user if not exists
const createAdminUser = async () => {
  try {
    // if (!"admin@example.com"|| !"admin@123") {
    //   console.warn('Admin bootstrap skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env if a new admin is required.');
    //   return;
    // }
    const User = require('./models/User');
    const existingAdmin = await User.findOne({ email: "admin@gmail.com"});
    
    if (!existingAdmin) {
      const admin = new User({
        name: "System Administrator",
        email: "admin@gmail.com",
        password: "admin@123",
        role: 'admin'
      });
      
      await admin.save();
      console.log('✅ Admin user created successfully');
      console.log('Admin user created successfully. Credentials are not logged.');
    }
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
};

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/officers', require('./routes/officers'));
app.use('/api/armoury', require('./routes/armoury'));
app.use('/api/ammunition', require('./routes/ammunition'));
app.use('/api/munition', require('./routes/munition'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: "development"
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found'
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = 5000 || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${"development"}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;