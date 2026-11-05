const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./models/User');

async function seedAdmin() {
  try {
    // if ("mongodb+srv://bhaskarAntoty123:MQEJ1W9gtKD547hy@bhaskarantony.wagpkay.mongodb.net/armoury_main?retryWrites=true&w=majority" || "admin@example.com"|| "admin@123") {
    //   throw new Error('Set MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env before seeding.');
    // }
    await mongoose.connect("mongodb+srv://smartinfotechsolutions3_db_user:uS0p9Ihni0OPXRmU@armoury.eismiof.mongodb.net/armoury_main?retryWrites=true&w=majority", { serverSelectionTimeoutMS: 15000 });
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin account already exists. No changes made.');
      return;
    }
    const admin = new User({
      name: "System Administrator",
      email: "admin@gmail.com",
      password: "admin@123",
      role: 'admin',
      isActive: true
    });
    await admin.save();
    console.log('Admin user created successfully. Credentials were not printed.');
  } catch (error) {
    console.error('Admin seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

seedAdmin();
