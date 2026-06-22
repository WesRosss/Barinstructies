# Use Node.js LTS version
FROM node:18-alpine

# Install ffmpeg and other dependencies for video processing
RUN apk add --no-cache ffmpeg curl git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (with increased memory limit)
ENV NODE_OPTIONS=--max-old-space-size=512
RUN npm install --omit=dev --no-audit --no-fund

# Copy application files
COPY . .

# Create required directories
RUN mkdir -p /app/videos /app/temp /app/uploads /app/data

# Set permissions for upload directories
RUN chmod -R 755 /app/videos /app/temp /app/uploads /app/data

# Expose port
EXPOSE 3210

# Start the server
CMD ["node", "server.js"]
