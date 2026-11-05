# KSRP Armoury Management System - Backend

## Overview
This is the backend API for the Karnataka State Reserve Police (KSRP) Armoury Management System. It provides a comprehensive REST API for managing weapons, ammunition, munitions, officers, and transactions.

## Features

### 🔐 Authentication & Security
- JWT-based authentication
- Role-based access control (Admin/Operator)
- Account lockout after failed attempts
- Password hashing with bcrypt
- Input validation and sanitization

### 👮 Officer Management
- Complete officer profiles with fingerprint data
- KGID-based identification
- Profile picture uploads
- Status tracking (active/inactive/suspended)

### 🔫 Weapons Management
- Comprehensive weapon tracking
- Barcode/QR code support
- Status management (available/issued/maintenance)
- Maintenance history tracking

### 🎯 Ammunition Management
- Stock level monitoring
- Batch tracking with expiry dates
- Low stock alerts
- Multiple caliber support

### 💥 Munitions Management
- Explosive and non-lethal munitions
- Safety classification (UN hazard classes)
- Storage condition tracking
- Usage reporting

### 📋 Transaction Management
- Issue/Return workflow
- Fingerprint verification
- Document upload for shortages
- Audit trail with timestamps

### 📊 Reporting & Analytics
- Real-time dashboard statistics
- Transaction history
- Stock level reports
- Alert system for low stock/expiring items

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer
- **Validation**: Joi & express-validator
- **Security**: Helmet, CORS, Rate limiting

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Create a `.env` file with the following variables:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/ksrp_armoury?replicaSet=rs0
   JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars
   JWT_EXPIRE=7d
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=replace_with_a_strong_password
   ADMIN_NAME=System Administrator
   MAX_FILE_SIZE=5242880
   BCRYPT_ROUNDS=12
   ```

3. **Start MongoDB**
   Ensure MongoDB is running as a replica set (required for atomic issue/return operations), or use MongoDB Atlas.

4. **Run the Server**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Create Admin User**
   The admin user is created automatically on first startup, or you can create one manually:
   ```bash
   curl -X POST https://main-armoury-portal-backend.onrender.com/api/auth/create-admin
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/logout` - User logout

### Officers
- `GET /api/officers` - Get all officers
- `POST /api/officers` - Create new officer
- `GET /api/officers/:id` - Get officer by ID
- `PUT /api/officers/:id` - Update officer
- `DELETE /api/officers/:id` - Delete officer
- `GET /api/officers/search/kgid/:kgid` - Find officer by KGID

### Weapons (Armoury)
- `GET /api/armoury` - Get all weapons
- `POST /api/armoury` - Add new weapon
- `GET /api/armoury/:id` - Get weapon by ID
- `PUT /api/armoury/:id` - Update weapon
- `DELETE /api/armoury/:id` - Delete weapon
- `GET /api/armoury/search/barcode/:barcode` - Find weapon by barcode

### Ammunition
- `GET /api/ammunition` - Get all ammunition
- `POST /api/ammunition` - Add new ammunition
- `GET /api/ammunition/:id` - Get ammunition by ID
- `PUT /api/ammunition/:id` - Update ammunition
- `DELETE /api/ammunition/:id` - Delete ammunition
- `GET /api/ammunition/alerts/low-stock` - Get low stock alerts
- `GET /api/ammunition/alerts/expiring` - Get expiring ammunition

### Munitions
- `GET /api/munition` - Get all munitions
- `POST /api/munition` - Add new munition
- `GET /api/munition/:id` - Get munition by ID
- `PUT /api/munition/:id` - Update munition
- `DELETE /api/munition/:id` - Delete munition
- `GET /api/munition/alerts/low-stock` - Get low stock alerts
- `GET /api/munition/alerts/expiring` - Get expiring munitions

### Transactions
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions/issue` - Issue items to officer
- `POST /api/transactions/return` - Return items from officer
- `GET /api/transactions/:id` - Get transaction by ID
- `GET /api/transactions/officer/:officerId` - Get officer transactions

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/recent-transactions` - Get recent transactions
- `GET /api/dashboard/alerts` - Get system alerts
- `GET /api/dashboard/activity` - Get recent activity

### Settings
- `GET /api/settings/system` - Get system settings
- `PUT /api/settings/system` - Update system settings
- `GET /api/settings/users` - Get all users
- `POST /api/settings/users` - Create new user

## Database Models

### User
- Authentication and user management
- Role-based permissions
- Account lockout functionality

### Officer
- Complete officer profiles
- Fingerprint data storage
- Status and rank management

### Armoury (Weapons)
- Weapon registration and tracking
- Barcode/QR code support
- Maintenance history

### Ammunition
- Stock management with batch tracking
- Expiry date monitoring
- Usage statistics

### Munition
- Explosive classification
- Safety requirements
- Storage conditions

### Transaction
- Issue/Return workflow
- Audit trail
- Document attachments

## Security Features

1. **Authentication**
   - JWT tokens with expiration
   - Password hashing with bcrypt
   - Account lockout after failed attempts

2. **Authorization**
   - Role-based access control
   - Admin-only endpoints protection

3. **Input Validation**
   - Request validation with Joi
   - SQL injection prevention
   - XSS protection

4. **File Upload Security**
   - File type validation
   - Size limits
   - Secure file storage

5. **Rate Limiting**
   - API rate limiting
   - Brute force protection

## Error Handling

The API uses consistent error response format:
```json
{
  "success": false,
  "message": "Error description",
  "errors": ["Detailed error messages"]
}
```

## File Uploads

- **Profile Pictures**: Stored in `uploads/profiles/`
- **Documents**: Stored in `uploads/documents/`
- **Max File Size**: 5MB
- **Allowed Types**: Images (JPG, PNG, GIF), Documents (PDF, DOC, DOCX)

## Development

### Running in Development Mode
```bash
npm run dev
```

### Environment Variables
All configuration is done through environment variables. See `.env` file for required variables.

### Database Seeding
The system automatically creates an admin user on startup. Additional seed data can be added as needed.

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper MongoDB connection
4. Set up reverse proxy (nginx)
5. Enable HTTPS
6. Configure proper backup strategy

## API Documentation

For detailed API documentation with request/response examples, refer to the Postman collection or API documentation tool of your choice.

## Support

For technical support or questions about the KSRP Armoury Management System backend, please contact the IT department.