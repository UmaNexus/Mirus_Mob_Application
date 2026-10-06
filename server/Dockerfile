FROM node:20-bookworm-slim

WORKDIR /app

# Install LibreOffice, Python 3, pip, standard fonts, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    python3 \
    python3-pip \
    fonts-liberation \
    fonts-noto-core \
    curl \
    && pip3 install --no-cache-dir pymupdf --break-system-packages \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code (including bundled fonts in assets/fonts/)
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
    CMD node -e "import('http').then(h => h.get('http://localhost:5000/api/health', r => {if (r.statusCode !== 200) process.exit(1)})).catch(() => process.exit(1))"

# Start the application
CMD ["npm", "start"]
