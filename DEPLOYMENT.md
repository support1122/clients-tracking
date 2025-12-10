# Deployment Guide for Dashboard Tracking

This guide will help you deploy the Dashboard Tracking application to Render.

## Prerequisites

1. A Render account (free tier available)
2. A MongoDB Atlas account (free tier available)
3. Your code pushed to GitHub

## Backend Deployment

### 1. Create a new Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the repository: `support1122/dashboard-tracking`

### 2. Configure Backend Service

**Basic Settings:**
- **Name**: `dashboard-tracking-backend`
- **Root Directory**: `applications-monitor-backend-main`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Environment Variables:**
Add these environment variables in Render dashboard:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority
NODE_ENV=production
```

**Note**: Render will automatically set the `PORT` environment variable.

### 3. Deploy Backend

Click "Create Web Service" and wait for deployment to complete.

## Frontend Deployment

### 1. Create a new Static Site on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Static Site"
3. Connect your GitHub repository
4. Select the repository: `support1122/dashboard-tracking`

### 2. Configure Frontend Service

**Basic Settings:**
- **Name**: `dashboard-tracking-frontend`
- **Root Directory**: `applications-monitor-frontend-main`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`

**Environment Variables:**
Add this environment variable in Render dashboard:

```
VITE_API_URL=https://your-backend-app.onrender.com
```

Replace `your-backend-app` with your actual backend service URL from Render.

### 3. Deploy Frontend

Click "Create Static Site" and wait for deployment to complete.

## MongoDB Atlas Setup

### 1. Create MongoDB Atlas Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist IP addresses (use 0.0.0.0/0 for Render)

### 2. Get Connection String

1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string
4. Replace `<password>` with your database user password
5. Replace `<dbname>` with your database name

## Environment Variables Summary

### Backend (.env)
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority
PORT=8086
NODE_ENV=production
```

### Frontend (.env)
```
VITE_API_URL=https://your-backend-app.onrender.com
```

## Testing Deployment

1. Check backend health: `https://your-backend-app.onrender.com/`
2. Check frontend: `https://your-frontend-app.onrender.com`
3. Test client management functionality
4. Verify job data is loading correctly

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure your backend URL is correct in frontend environment variables
2. **Database Connection**: Verify MongoDB URI and network access
3. **Build Failures**: Check that all dependencies are in package.json
4. **Environment Variables**: Ensure all required variables are set in Render dashboard

### Logs:
- Check Render service logs for detailed error messages
- Backend logs: Render Dashboard → Your Backend Service → Logs
- Frontend logs: Render Dashboard → Your Frontend Service → Logs

## Production Considerations

1. **Security**: Use strong MongoDB passwords and restrict IP access
2. **Performance**: Consider upgrading to paid Render plans for better performance
3. **Monitoring**: Set up monitoring and alerts in Render dashboard
4. **Backups**: Regular MongoDB Atlas backups are recommended

## Support

If you encounter issues:
1. Check Render service logs
2. Verify environment variables
3. Test API endpoints directly
4. Check MongoDB Atlas connection status
