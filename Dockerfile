FROM node:20-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source files
COPY src ./src
COPY tsconfig.json ./

# Build the project
RUN npm run build

# Start the service
CMD ["sh", "-c", "node dist/server.js --transport http --port $PORT"]
