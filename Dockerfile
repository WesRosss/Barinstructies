# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (with increased memory limit)
ENV NODE_OPTIONS=--max-old-space-size=512
RUN npm install --omit=dev --no-audit --no-fund

# Copy application files
COPY . .

# Create videos directory
RUN mkdir -p /app/videos

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
