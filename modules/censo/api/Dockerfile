FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install ts-node globally and nodemon for dev
RUN npm install -g typescript ts-node nodemon

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
