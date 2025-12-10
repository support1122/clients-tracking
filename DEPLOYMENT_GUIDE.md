# 🚀 Deployment Guide - Applications Monitor Dashboard

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB Atlas account or local MongoDB instance
- Git

## 🔧 Environment Setup

### Backend Environment Variables

Create `.env` file in `applications-monitor-backend-main/`:

```env
# Server Configuration
PORT=8086
NODE_ENV=production

# Database Configuration
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/your-database?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Admin Configuration
ADMIN_EMAILS=tripathipranjal01@gmail.com,adit.jain606@gmail.com

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com

# Session Key Configuration
SESSION_KEY_DURATION=24
```

### Frontend Environment Variables

Create `.env` file in `applications-monitor-frontend-main/`:

```env
# API Configuration
VITE_API_URL=https://your-backend-domain.com

# Environment
VITE_NODE_ENV=production
```

## 🏗️ Build & Deploy

### Backend Deployment

1. **Install Dependencies:**
   ```bash
   cd applications-monitor-backend-main
   npm install
   ```

2. **Production Build:**
   ```bash
   npm run build
   ```

3. **Start Production Server:**
   ```bash
   npm run prod
   ```

### Frontend Deployment

1. **Install Dependencies:**
   ```bash
   cd applications-monitor-frontend-main
   npm install
   ```

2. **Production Build:**
   ```bash
   npm run build
   ```

3. **Preview Production Build:**
   ```bash
   npm run prod
   ```

## 🌐 Platform-Specific Deployment

### Render.com

#### Backend (Render)
1. Connect your GitHub repository
2. Set build command: `npm install`
3. Set start command: `npm run prod`
4. Add environment variables in Render dashboard

#### Frontend (Render)
1. Connect your GitHub repository
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables in Render dashboard

### Vercel

#### Backend (Vercel)
1. Import project from GitHub
2. Set framework preset: `Other`
3. Set build command: `npm run build`
4. Set output directory: `.`
5. Add environment variables in Vercel dashboard

#### Frontend (Vercel)
1. Import project from GitHub
2. Set framework preset: `Vite`
3. Add environment variables in Vercel dashboard

### Railway

#### Backend (Railway)
1. Connect GitHub repository
2. Set start command: `npm run prod`
3. Add environment variables in Railway dashboard

#### Frontend (Railway)
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set start command: `npm run preview`
4. Add environment variables in Railway dashboard

## 🔒 Security Checklist

- [ ] Change default JWT_SECRET
- [ ] Use HTTPS in production
- [ ] Set proper CORS_ORIGIN
- [ ] Use environment variables for all sensitive data
- [ ] Enable MongoDB authentication
- [ ] Use strong passwords for admin accounts

## 📊 Database Setup

### MongoDB Atlas
1. Create a new cluster
2. Create a database user
3. Whitelist your server IP addresses
4. Get connection string and add to MONGODB_URI

### Initial Admin Users
The system will automatically create admin users based on ADMIN_EMAILS environment variable.

## 🔍 Troubleshooting

### Common Issues

1. **CORS Errors:**
   - Ensure CORS_ORIGIN matches your frontend domain
   - Check if credentials are enabled

2. **Database Connection:**
   - Verify MONGODB_URI is correct
   - Check network access in MongoDB Atlas

3. **Environment Variables:**
   - Ensure all required variables are set
   - Check variable names match exactly

### Logs
- Backend logs: Check server console output
- Frontend logs: Check browser developer console
- Database logs: Check MongoDB Atlas logs

## 📈 Performance Optimization

### Backend
- Enable MongoDB connection pooling
- Use PM2 for process management
- Implement rate limiting
- Add request logging

### Frontend
- Enable gzip compression
- Use CDN for static assets
- Implement lazy loading
- Optimize bundle size

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd applications-monitor-backend-main && npm install
      - run: cd applications-monitor-backend-main && npm run build
      # Add deployment steps here

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd applications-monitor-frontend-main && npm install
      - run: cd applications-monitor-frontend-main && npm run build
      # Add deployment steps here
```

## 📞 Support

For deployment issues:
1. Check environment variables
2. Verify database connectivity
3. Check server logs
4. Ensure all dependencies are installed

---

**🎉 Your Applications Monitor Dashboard is now deployment-ready!**
