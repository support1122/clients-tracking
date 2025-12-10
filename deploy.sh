#!/bin/bash

# 🚀 Applications Monitor Dashboard - Deployment Script

echo "🚀 Starting deployment process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if .env files exist
check_env_files() {
    echo "🔍 Checking environment files..."
    
    if [ ! -f "applications-monitor-backend-main/.env" ]; then
        print_warning "Backend .env file not found. Creating from .env.example..."
        if [ -f "applications-monitor-backend-main/.env.example" ]; then
            cp applications-monitor-backend-main/.env.example applications-monitor-backend-main/.env
            print_status "Backend .env file created from example"
        else
            print_error "Backend .env.example file not found!"
            exit 1
        fi
    else
        print_status "Backend .env file exists"
    fi
    
    if [ ! -f "applications-monitor-frontend-main/.env" ]; then
        print_warning "Frontend .env file not found. Creating from .env.example..."
        if [ -f "applications-monitor-frontend-main/.env.example" ]; then
            cp applications-monitor-frontend-main/.env.example applications-monitor-frontend-main/.env
            print_status "Frontend .env file created from example"
        else
            print_error "Frontend .env.example file not found!"
            exit 1
        fi
    else
        print_status "Frontend .env file exists"
    fi
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    
    # Backend dependencies
    echo "Installing backend dependencies..."
    cd applications-monitor-backend-main
    npm install
    if [ $? -eq 0 ]; then
        print_status "Backend dependencies installed"
    else
        print_error "Failed to install backend dependencies"
        exit 1
    fi
    cd ..
    
    # Frontend dependencies
    echo "Installing frontend dependencies..."
    cd applications-monitor-frontend-main
    npm install
    if [ $? -eq 0 ]; then
        print_status "Frontend dependencies installed"
    else
        print_error "Failed to install frontend dependencies"
        exit 1
    fi
    cd ..
}

# Build applications
build_applications() {
    echo "🏗️  Building applications..."
    
    # Backend build
    echo "Building backend..."
    cd applications-monitor-backend-main
    npm run build
    if [ $? -eq 0 ]; then
        print_status "Backend build completed"
    else
        print_error "Backend build failed"
        exit 1
    fi
    cd ..
    
    # Frontend build
    echo "Building frontend..."
    cd applications-monitor-frontend-main
    npm run build
    if [ $? -eq 0 ]; then
        print_status "Frontend build completed"
    else
        print_error "Frontend build failed"
        exit 1
    fi
    cd ..
}

# Start applications
start_applications() {
    echo "🚀 Starting applications..."
    
    # Start backend
    echo "Starting backend server..."
    cd applications-monitor-backend-main
    npm run prod &
    BACKEND_PID=$!
    cd ..
    
    # Wait a moment for backend to start
    sleep 3
    
    # Start frontend
    echo "Starting frontend server..."
    cd applications-monitor-frontend-main
    npm run prod &
    FRONTEND_PID=$!
    cd ..
    
    print_status "Applications started successfully!"
    echo "Backend PID: $BACKEND_PID"
    echo "Frontend PID: $FRONTEND_PID"
    
    # Save PIDs for cleanup
    echo $BACKEND_PID > .backend_pid
    echo $FRONTEND_PID > .frontend_pid
}

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up..."
    if [ -f ".backend_pid" ]; then
        BACKEND_PID=$(cat .backend_pid)
        kill $BACKEND_PID 2>/dev/null
        rm .backend_pid
    fi
    if [ -f ".frontend_pid" ]; then
        FRONTEND_PID=$(cat .frontend_pid)
        kill $FRONTEND_PID 2>/dev/null
        rm .frontend_pid
    fi
    print_status "Cleanup completed"
}

# Main deployment function
main() {
    echo "🎯 Applications Monitor Dashboard Deployment"
    echo "=============================================="
    
    # Check environment files
    check_env_files
    
    # Install dependencies
    install_dependencies
    
    # Build applications
    build_applications
    
    # Start applications
    start_applications
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📱 Applications are running:"
    echo "   Backend:  http://localhost:8086"
    echo "   Frontend: http://localhost:3000"
    echo ""
    echo "🛑 To stop applications, run: ./deploy.sh stop"
    echo "📖 For more information, see DEPLOYMENT_GUIDE.md"
}

# Handle stop command
if [ "$1" = "stop" ]; then
    cleanup
    print_status "Applications stopped"
    exit 0
fi

# Handle help command
if [ "$1" = "help" ] || [ "$1" = "-h" ]; then
    echo "🚀 Applications Monitor Dashboard - Deployment Script"
    echo ""
    echo "Usage:"
    echo "  ./deploy.sh        - Deploy applications"
    echo "  ./deploy.sh stop   - Stop applications"
    echo "  ./deploy.sh help   - Show this help"
    echo ""
    echo "Make sure to configure your .env files before deployment!"
    exit 0
fi

# Run main deployment
main

# Set up signal handlers for cleanup
trap cleanup EXIT INT TERM
