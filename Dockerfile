FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY figma-smart-image-mcp/package.json figma-smart-image-mcp/package-lock.json* figma-smart-image-mcp/tsconfig.json ./

# Install dependencies (skip postinstall to avoid premature build)
RUN npm install --ignore-scripts

# Copy source files
COPY figma-smart-image-mcp/src ./src

# Now build the project
RUN npm run build

# Start the service
CMD ["sh", "-c", "node dist/server.js --transport http --port $PORT"]
