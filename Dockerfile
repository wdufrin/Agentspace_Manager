# Stage 1: Build the React application
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package dependencies
COPY package*.json ./

# Install all dependencies (including devDependencies for Vite)
RUN npm ci

# Copy the rest of the application codebase
COPY . .

# Build the application for production
RUN npm run build

# Stage 2: Serve the compiled front-end
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy the compiled build from the builder stage
COPY --from=builder /app/dist ./dist

# Install 'serve' globally to serve the static files natively
RUN npm install -g serve

# Cloud Run expects the container to listen on Port 8080
EXPOSE 8080

# Run 'serve' allowing single-page app routing (-s) on port 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
