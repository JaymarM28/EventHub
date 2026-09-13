#!/bin/bash
# Crea una base de datos Postgres separada por microservicio (database-per-service)
# dentro del mismo contenedor — simplifica el aprendizaje sin sacrificar el
# aislamiento de datos entre bounded contexts.
set -e

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  echo "Creando múltiples bases de datos: $POSTGRES_MULTIPLE_DATABASES"
  for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
    echo "  -> $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
      CREATE DATABASE $db;
      GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
  done
  echo "Bases de datos creadas."
fi
