# Use Node.js LTS as base image
FROM node:20-slim

RUN npm install -g pnpm
# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN pnpm install --only=production

# Copy source code
COPY . .

# Remove any existing .env files for security
RUN rm -f .env

# Create a non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]