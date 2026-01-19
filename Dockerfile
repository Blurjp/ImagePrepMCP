FROM node:18-alpine

WORKDIR /app

# Copy package.json files
COPY package.json package-lock.json* ./
COPY figma-smart-image-mcp/package.json ./figma-smart-image-mcp/

# Install dependencies
WORKDIR /app/figma-smart-image-mcp
RUN npm install

# Copy source files
COPY figma-smart-image-mcp/src ./src
COPY figma-smart-image-mcp/tsconfig.json ./

# Build the project
RUN npm run build

# Set working directory back to app for start command
WORKDIR /app

# Start the service
CMD ["sh", "-c", "cd figma-smart-image-mcp && node dist/server.js --transport http --port $PORT"]
