#!/bin/bash
set -e

cd "$(dirname "$0")"

case "${1:-up}" in
  up)
    echo "🚀 Starting ForkFit development environment..."
    docker-compose up -d --build
    echo ""
    echo "✅ Services starting..."
    echo "   Frontend: http://localhost:3000"
    echo "   API:      http://localhost:8000"
    echo "   Kafka:    localhost:9092"
    echo ""
    echo "📋 Logs: docker-compose logs -f"
    echo "🛑 Stop: ./docker-dev.sh down"
    ;;
  down)
    echo "🛑 Stopping ForkFit..."
    docker-compose down
    ;;
  logs)
    docker-compose logs -f "${@:2}"
    ;;
  restart)
    echo "🔄 Restarting services..."
    docker-compose restart "${@:2}"
    ;;
  rebuild)
    echo "🔨 Rebuilding and restarting..."
    docker-compose up -d --build "${@:2}"
    ;;
  ps)
    docker-compose ps
    ;;
  *)
    echo "Usage: ./docker-dev.sh {up|down|logs|restart|rebuild|ps}"
    exit 1
    ;;
esac
