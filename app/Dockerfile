# Use Node.js 18 Alpine Linux image for minimal footprint
# Alpine is chosen for smaller image size (~50MB vs ~900MB for full node image)
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json first for better Docker layer caching
# If package.json hasn't changed, npm install layer will be cached
COPY package.json ./

# Install production dependencies
RUN npm install

# Copy the rest of the application code
# This is done after npm install to leverage Docker cache layers
COPY . .

# Expose port 8080 as required by the task specification
# This port is mapped to port 80 by Elastic Beanstalk configuration
EXPOSE 8080

# Run the Node.js server when container starts
CMD [ "node", "server.js" ]