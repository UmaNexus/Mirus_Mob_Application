#!/bin/bash

# HRMS Docker Quick Commands
# Usage: ./docker-commands.sh [command]

set -e

command=${1:-help}

case $command in
  start)
    echo "🚀 Starting HRMS services..."
    docker-compose up -d --build
    echo "✅ Services started!"
    echo ""
    echo "📍 Access points:"
    echo "   - Client:  http://localhost"
    echo "   - Server:  http://localhost:5000"
    echo "   - MongoDB: mongodb://admin:admin123@localhost:27017"
    ;;

  stop)
    echo "⛔ Stopping HRMS services..."
    docker-compose down
    echo "✅ Services stopped!"
    ;;

  restart)
    echo "🔄 Restarting HRMS services..."
    docker-compose restart
    echo "✅ Services restarted!"
    ;;

  logs)
    service=${2:-all}
    echo "📋 Showing logs for: $service"
    if [ "$service" = "all" ]; then
      docker-compose logs -f
    else
      docker-compose logs -f "$service"
    fi
    ;;

  clean)
    echo "🧹 Cleaning up Docker resources..."
    docker-compose down -v --remove-orphans
    echo "✅ Cleanup complete!"
    ;;

  build)
    echo "🔨 Building Docker images..."
    docker-compose build --no-cache
    echo "✅ Build complete!"
    ;;

  shell)
    service=${2:-server}
    echo "🔓 Entering shell for: $service"
    docker-compose exec "$service" sh
    ;;

  status)
    echo "📊 HRMS Services Status:"
    docker-compose ps
    ;;

  seed)
    echo "🌱 Seeding database..."
    docker-compose exec server npm run db:seed
    echo "✅ Database seeded!"
    ;;

  seed-admin)
    echo "👨‍💼 Seeding admin user..."
    docker-compose exec server npm run db:seed:admin
    echo "✅ Admin user seeded!"
    ;;

  test)
    echo "🧪 Running tests..."
    docker-compose exec server npm test
    ;;

  health)
    echo "🏥 Checking service health..."
    echo ""
    echo "Server:"
    curl -s http://localhost:5000/api/health | python3 -m json.tool || echo "❌ Server unreachable"
    echo ""
    echo "MongoDB:"
    docker-compose exec mongodb mongosh -u admin -p admin123 --eval "db.adminCommand('ping')" || echo "❌ MongoDB unreachable"
    ;;

  rebuild-server)
    echo "🔨 Rebuilding server..."
    docker-compose up -d --no-deps --build server
    echo "✅ Server rebuilt!"
    ;;

  rebuild-client)
    echo "🔨 Rebuilding client..."
    docker-compose up -d --no-deps --build client
    echo "✅ Client rebuilt!"
    ;;

  volume-ls)
    echo "💾 Docker volumes:"
    docker volume ls | grep hrms
    ;;

  stats)
    echo "📈 Container resource usage:"
    docker stats hrms-server hrms-client hrms-mongodb --no-stream
    ;;

  *)
    echo "HRMS Docker Quick Commands"
    echo ""
    echo "Usage: ./docker-commands.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start              - Start all services"
    echo "  stop               - Stop all services"
    echo "  restart            - Restart all services"
    echo "  build              - Build Docker images"
    echo "  clean              - Stop and remove all resources"
    echo "  logs [service]     - Show logs (service: server, client, mongodb, all)"
    echo "  shell [service]    - Enter container shell (service: server, client, mongodb)"
    echo "  status             - Show running containers status"
    echo "  seed               - Seed database with initial data"
    echo "  seed-admin         - Seed admin user"
    echo "  test               - Run backend tests"
    echo "  health             - Check health of all services"
    echo "  rebuild-server     - Rebuild and restart server"
    echo "  rebuild-client     - Rebuild and restart client"
    echo "  volume-ls          - List HRMS volumes"
    echo "  stats              - Show resource usage"
    echo ""
    echo "Examples:"
    echo "  ./docker-commands.sh start"
    echo "  ./docker-commands.sh logs server"
    echo "  ./docker-commands.sh shell mongodb"
    ;;
esac
