# FlashFire Client Tracking Portal

A comprehensive client tracking and management system with role-based authentication, built with React and Node.js.

## Features

- 🔐 **Role-based Authentication**: Admin and Team Lead roles with different access levels
- 🎫 **Session Key System**: One-time use session keys for Team Lead access
- 👥 **User Management**: Create, manage, and delete team lead users
- 📊 **Client Tracking**: Monitor client applications and job statuses
- 🛡️ **Secure**: JWT-based authentication with bcrypt password hashing
- 🎨 **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Tech Stack

### Frontend
- React 19
- Vite
- Tailwind CSS
- JavaScript (ES6+)

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- JWT Authentication
- bcryptjs for password hashing

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/support1122/clients-tracking.git
   cd clients-tracking
   ```

2. **Backend Setup**
   ```bash
   cd applications-monitor-backend-main
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd applications-monitor-frontend-main
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

4. **Access the Application**
   - Frontend: Configured via VITE_API_URL
   - Backend API: Configured via PORT environment variable

## Required Environment Variables

⚠️ **IMPORTANT**: The following environment variables are **REQUIRED** for the application to work:

### Backend Required Variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT token signing
- `CORS_ORIGIN` - Frontend URL for CORS configuration

### Frontend Required Variables:
- `VITE_API_URL` - Backend API URL

## Environment Configuration

### Backend (.env)
```env
# Database Configuration (REQUIRED)
MONGODB_URI=your_mongodb_connection_string_here

# Server Configuration
PORT=8086
NODE_ENV=development

# JWT Configuration (REQUIRED)
JWT_SECRET=your_super_secret_jwt_key_here

# CORS Configuration (REQUIRED)
CORS_ORIGIN=your_frontend_url_here
```

### Frontend (.env)
```env
# API Configuration (REQUIRED)
VITE_API_URL=your_backend_api_url_here

# App Configuration
VITE_APP_NAME=FlashFire Portal
VITE_APP_DESCRIPTION=Client Tracking Portal
```

## Admin User Management

Admin users are managed directly in the MongoDB database. To create or modify admin users:

1. **Access your MongoDB database** (Atlas or local)
2. **Navigate to the `tracking_portal_users` collection**
3. **Create admin user document**:
   ```json
   {
     "email": "admin@example.com",
     "password": "$2b$10$hashed_password_here",
     "role": "admin",
     "isActive": true,
     "createdAt": "current_timestamp",
     "updatedAt": "current_timestamp"
   }
   ```
4. **Hash the password** using bcrypt with salt rounds 10

**Current Admin Users** (as shown in your database):
- `tripathiranjal01@gmail.com`
- `adit.jain606@gmail.com`

## User Roles

### Admin Users
- Full access to admin dashboard
- Can create and manage team lead users
- Can generate session keys for team leads
- Can delete team lead users
- Access to tracking portal
- **Note**: Admin users are managed directly in the database. No automatic creation.

### Team Lead Users
- Access to tracking portal only
- Require session key for login (one-time use)
- Cannot access admin functions
- Created by admins through the admin dashboard

## API Endpoints

### Authentication
- `POST /api/auth/verify-credentials` - Verify email/password
- `POST /api/auth/login` - Complete login process
- `POST /api/auth/users` - Create new user (admin only)
- `GET /api/auth/users` - Get all users (admin only)
- `DELETE /api/auth/users/:userId` - Delete user (admin only)
- `POST /api/auth/session-key` - Generate session key (admin only)
- `GET /api/auth/session-keys/:userEmail` - Get user session keys (admin only)

### Data Management
- `POST /` - Get all jobs
- `POST /api/jobs` - Create new job
- `GET /api/clients` - Get all clients
- `GET /api/clients/:email` - Get client by email
- `POST /api/clients` - Create or update client

## Database Collections

- `tracking_portal_users` - User authentication data
- `sessionkeys` - One-time session keys
- `jobdbs` - Job application data (existing)
- `users` - Client data (existing)

## Security Features

- JWT token-based authentication
- bcrypt password hashing
- One-time use session keys
- Role-based access control
- CORS protection
- Input validation and sanitization

## Deployment

### Production Environment Variables
Make sure to set secure values for:
- `JWT_SECRET` - Use a strong, random secret
- `ADMIN_PASSWORD` - Use a strong password
- `MONGODB_URI` - Use your production MongoDB connection string
- `CORS_ORIGIN` - Set to your production frontend URL

### Build for Production
```bash
# Backend
cd applications-monitor-backend-main
npm run build

# Frontend
cd applications-monitor-frontend-main
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is proprietary software. All rights reserved.

## Support

For support and questions, please contact the development team.