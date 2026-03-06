# Use Node.js 20 lightweight Alpine image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install build dependencies
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application source
COPY . .

# Environment Variables
ENV NODE_ENV=production
# Force the app to listen on 5000
ENV PORT=5000

# Expose port 5000
EXPOSE 5000

# Start the application
CMD [ "node", "src/server.js" ]
