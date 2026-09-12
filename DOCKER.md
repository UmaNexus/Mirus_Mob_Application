# HRMS Docker Setup Guide

This document provides instructions for running the HRMS application using Docker and Docker Compose.

## Prerequisites

- Docker >= 20.10
- Docker Compose >= 2.0
- At least 2GB of available RAM

## Project Structure

```
hrms/
├── client/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .dockerignore
├── server/
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml
├── .env.example
└── Dockerfile.README.md (this file)
```

## Quick Start

### 1. Prepare Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual configuration
# At minimum, change:
# - JWT_SECRET
# - ADMIN_PASSWORD
# - SMTP credentials (if using email)
```

### 2. Build and Run with Docker Compose

```bash
# Build images and start all services
docker-compose up --build

# Or run in detached mode (background)
docker-compose up -d --build

# View logs
docker-compose logs -f
```

This will start:
- **MongoDB**: `mongodb://localhost:27017` (authentication: admin/admin123)
- **Server**: `http://localhost:5000` (Express API)
- **Client**: `http://localhost` (Nginx - React app)

### 3. Stop Services

```bash
# Stop all running containers
docker-compose down

# Stop and remove all data
docker-compose down -v
```

## Individual Service Management

### Build Individual Images

```bash
# Build only the server image
docker build -t hrms-server ./server

# Build only the client image
docker build -t hrms-client ./client
```

### Run Individual Containers

```bash
# Run server standalone (requires MongoDB running separately)
docker run -p 5000:5000 \
  -e MONGO_URI=mongodb://localhost:27017/hrms \
  -e NODE_ENV=development \
  hrms-server

# Run client standalone
docker run -p 80:80 hrms-client
```

## Available Services

### MongoDB
- **Port**: 27017
- **Username**: admin
- **Password**: admin123
- **Database**: hrms
- **Data Volume**: `mongodb_data` (persistent across restarts)

### Server
- **Port**: 5000
- **Base URL**: `http://server:5000`
- **Health Check**: Available at `/api/health`
- **Uploaded Files**: Mounted at `/app/uploads`

### Client
- **Port**: 3001
- **Base URL**: `http://localhost`
- **Proxy**: Configured to forward `/api/*` requests to server

## Configuration Reference

### Environment Variables

Key variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | production | Node environment |
| MONGO_URI | mongodb://admin:admin123@mongodb:27017/hrms | MongoDB connection string |
| JWT_SECRET | (required) | JWT signing secret |
| JWT_EXPIRE | 7d | JWT token expiration |
| ADMIN_EMAIL | admin@hrms.com | Initial admin email |
| ADMIN_PASSWORD | Admin123! | Initial admin password |
| SMTP_HOST | smtp.gmail.com | Email service host |
| SMTP_PORT | 587 | Email service port |
| SMTP_USER | (optional) | Email service username |
| SMTP_PASS | (optional) | Email service password |

### Docker Compose Networking

- All services communicate via `hrms-network` bridge network
- Service names are automatically resolvable (e.g., `mongodb`, `server`, `client`)
- Only ports 80 (client) and 5000 (server) are exposed to the host

## Debugging

### View Container Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f mongodb

# Last 100 lines
docker-compose logs --tail=100 server
```

### Access Container Shell

```bash
# Access server container
docker exec -it hrms-server sh

# Access client container
docker exec -it hrms-client sh

# Access MongoDB container
docker exec -it hrms-mongodb mongosh -u admin -p admin123
```

### Check Container Status

```bash
# List running containers
docker-compose ps

# Inspect service health
docker-compose exec server npm run health
```

## Performance Optimization

### Reduce Image Sizes

The Dockerfile uses `.dockerignore` to exclude unnecessary files:
- `node_modules` (reinstalled in container)
- `.git` files
- Build artifacts
- Documentation

### Volume Performance on macOS

If experiencing slow performance on macOS, consider:
1. Using `docker-sync` for better I/O performance
2. Running Docker in VM with more resources (Docker Desktop settings)
3. Using named volumes instead of bind mounts

## Production Deployment

### Security Recommendations

1. **Change Default Credentials**
   ```bash
   # In .env, set strong values for:
   JWT_SECRET=<strong-random-string>
   ADMIN_PASSWORD=<strong-password>
   MONGO_INITDB_ROOT_PASSWORD=<strong-password>
   ```

2. **Use Environment Variables**
   - Never commit `.env` to version control
   - Use separate `.env` files for different environments

3. **Enable SSL/TLS**
   - Configure nginx with SSL certificates
   - Update `client/nginx.conf` with SSL directives

4. **Database Security**
   - Change MongoDB default credentials
   - Enable MongoDB authentication
   - Use firewall rules to restrict access

5. **Network Security**
   - Only expose necessary ports
   - Use private networks
   - Configure proper CORS headers

### Deployment Steps

1. **Build optimized images**:
   ```bash
   docker-compose build --no-cache
   ```

2. **Tag and push to registry**:
   ```bash
   docker tag hrms-server myregistry/hrms-server:latest
   docker push myregistry/hrms-server:latest
   ```

3. **Deploy using orchestration** (Kubernetes, Docker Swarm, etc.)

## Common Issues & Solutions

### MongoDB Connection Refused

**Solution**: Ensure MongoDB container is healthy
```bash
docker-compose logs mongodb
docker-compose exec mongodb mongosh -u admin -p admin123
```

### Server Can't Connect to MongoDB

**Solution**: Check network connectivity
```bash
docker-compose exec server ping mongodb
```

### Port Already in Use

**Solution**: Change ports in `docker-compose.yml` or stop conflicting services
```bash
# Find what's using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### Client Shows "Cannot GET /api"

**Solution**: Verify server is running and nginx proxy is configured
```bash
docker-compose ps
docker-compose logs client
```

### Out of Memory

**Solution**: Increase Docker memory allocation or limit container resources
```yaml
# In docker-compose.yml, add:
services:
  server:
    mem_limit: 512m
```

## Useful Commands

```bash
# Complete restart
docker-compose restart

# Rebuild without cache
docker-compose build --no-cache

# Remove all resources (careful!)
docker-compose down -v --remove-orphans

# Execute commands in container
docker-compose exec server npm run db:seed
docker-compose exec server npm test

# Update a single service
docker-compose up -d --no-deps --build server
docker-compose exec server npm run db:setup -- --company-code=mirus --company-name="Mirus Med Sciences" \
  --admin-email=admin@mirus.com --admin-password='Admin@123'
```

## Monitoring

### Health Checks

Both server and client include health checks:

```bash
# Server health
curl http://localhost:5000/api/health

# Nginx status
docker-compose exec client nginx -t
```

### Resource Usage

```bash
# Monitor container stats
docker stats hrms-server hrms-client hrms-mongodb
```

### Employee Code Mirgration
```
# Dry-run (default)
cd server && node scripts/migrate-employee-ids-to-mms.js
# Apply
cd server && node scripts/migrate-employee-ids-to-mms.js --apply
docker-compose exec server node scripts/migrate-employee-ids-to-mms.js --apply

or 
cd server

# Preview only
npm run db:migrate:emp-ids-mms
# or: node scripts/migrate-employee-ids-to-mms.js

# Apply
node scripts/migrate-employee-ids-to-mms.js --apply
```

### Delete user payslips (safe dry-run / execute)
```
# Dry-run (default) - shows affected user and payslips (no deletion)
cd server && node scripts/delete-user-payslips.js --email=alice@example.com
# or by employee id
cd server && node scripts/delete-user-payslips.js --employeeId=EMP123

# Execute deletion (will run inside a MongoDB transaction)
cd server && node scripts/delete-user-payslips.js --email=alice@example.com --execute

# Run from the running server container (dry-run or execute)
docker-compose exec server node scripts/delete-user-payslips.js --email=alice@example.com
docker-compose exec server node scripts/delete-user-payslips.js --email=alice@example.com --execute

``` 

## Next Steps

1. Review and customize the Dockerfiles for your needs
2. Set up CI/CD pipeline to automatically build and push images
3. Configure external logging and monitoring solutions
4. Implement backup strategy for MongoDB volumes
5. Set up SSL/TLS certificates for production

## Support

For issues or questions, refer to:
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Docker Image](https://hub.docker.com/_/mongo)
- [Nginx Documentation](https://nginx.org/en/docs/)
