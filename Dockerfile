FROM node:20-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY figma-smart-image-mcp/package.json figma-smart-image-mcp/package-lock.json* ./
RUN npm install

# Copy source files
COPY figma-smart-image-mcp/src ./src
COPY figma-smart-image-mcp/tsconfig.json ./

# Build the project
RUN npm run build

# Start the service
CMD ["sh", "-c", "node dist/server.js --transport http --port $PORT"]
