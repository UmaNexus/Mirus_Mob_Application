FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Placeholder dirs (overlaid at runtime by the docker-compose bind mount)
RUN mkdir -p \
  uploads/documents \
  uploads/documents/generated \
  uploads/documents/filled \
  uploads/training \
  uploads/company \
  uploads/avatars \
  uploads/offers/signed \
  uploads/payslips \
  uploads/letter-templates \
  uploads/cf-templates \
  uploads/cf-issued \
  logs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["npm", "start"]
