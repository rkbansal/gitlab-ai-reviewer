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

# Create .env file from environment variables
RUN echo "GITLAB_URL=${GITLAB_URL}" > .env && \
    echo "GITLAB_TOKEN=${GITLAB_TOKEN}" >> .env && \
    echo "EXPECTED_GITLAB_TOKEN=${EXPECTED_GITLAB_TOKEN}" >> .env && \
    echo "OPENAI_API_KEY=${OPENAI_API_KEY}" >> .env && \
    echo "AI_MODEL=${AI_MODEL}" >> .env

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]