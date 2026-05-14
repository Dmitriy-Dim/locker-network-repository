#!/bin/sh
set -eu

AWS_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
ACCOUNT_ID="000000000000"
OPERATIONS_QUEUE="locker-operations-queue"
CACHE_PROJECTION_QUEUE="locker-dev-cache-projection"
OPERATIONS_TABLE="locker-dev-operations-dynamodb"
LOCKER_CACHE_TABLE="locker-dev-locker-cache"
BOOKINGS_TABLE="locker-dev-booking-dynamodb"
TS_LAMBDA_DIR="/opt/locker-localstack/ts-lambda"
OPERATIONS_ZIP_PATH="/tmp/operations-handler.zip"
CACHE_PROJECTION_ZIP_PATH="/tmp/cache-projection-handler.zip"

LEGACY_CACHE_QUEUE="locker-cache-projection"
LEGACY_LOCKER_CACHE_TABLE="locker-locker-cache"
LEGACY_CACHE_LAMBDA="locker-cache-projection"
OPERATIONS_LAMBDA="locker-command-handler"
CACHE_PROJECTION_LAMBDA="locker-cache-projection-handler"

awslocal_safe() {
  awslocal "$@" >/dev/null 2>&1 || true
}

queue_exists() {
  awslocal sqs get-queue-url --queue-name "$1" >/dev/null 2>&1
}

table_exists() {
  awslocal dynamodb describe-table --table-name "$1" >/dev/null 2>&1
}

function_exists() {
  awslocal lambda get-function --function-name "$1" >/dev/null 2>&1
}

delete_event_source_mappings_for_function() {
  FUNCTION_NAME="$1"
  UUIDS="$(awslocal lambda list-event-source-mappings --function-name "${FUNCTION_NAME}" --query 'EventSourceMappings[].UUID' --output text 2>/dev/null || true)"

  if [ -n "${UUIDS}" ]; then
    for UUID in ${UUIDS}; do
      awslocal_safe lambda delete-event-source-mapping --uuid "${UUID}"
    done
  fi
}

ensure_queue() {
  QUEUE_NAME="$1"
  if ! queue_exists "${QUEUE_NAME}"; then
    awslocal sqs create-queue --queue-name "${QUEUE_NAME}" >/dev/null
  fi
}

ensure_dynamodb_table() {
  TABLE_NAME="$1"
  KEY_NAME="$2"

  if ! table_exists "${TABLE_NAME}"; then
    awslocal dynamodb create-table \
      --table-name "${TABLE_NAME}" \
      --attribute-definitions "AttributeName=${KEY_NAME},AttributeType=S" \
      --key-schema "AttributeName=${KEY_NAME},KeyType=HASH" \
      --billing-mode PAY_PER_REQUEST >/dev/null
  fi
}

ensure_booking_table() {
  if ! table_exists "${BOOKINGS_TABLE}"; then
    awslocal dynamodb create-table \
      --table-name "${BOOKINGS_TABLE}" \
      --attribute-definitions \
        AttributeName=bookingId,AttributeType=S \
        AttributeName=GSI1PK,AttributeType=S \
      --key-schema AttributeName=bookingId,KeyType=HASH \
      --global-secondary-indexes '[
        {
          "IndexName": "GSI1",
          "KeySchema": [
            {
              "AttributeName": "GSI1PK",
              "KeyType": "HASH"
            }
          ],
          "Projection": {
            "ProjectionType": "ALL"
          }
        }
      ]' \
      --billing-mode PAY_PER_REQUEST >/dev/null
  fi
}

ensure_lambda_function() {
  FUNCTION_NAME="$1"
  HANDLER="$2"
  ZIP_PATH="$3"
  ENV_VARS="$4"

  if function_exists "${FUNCTION_NAME}"; then
    awslocal lambda update-function-code \
      --function-name "${FUNCTION_NAME}" \
      --zip-file "fileb://${ZIP_PATH}" >/dev/null

    awslocal lambda update-function-configuration \
      --function-name "${FUNCTION_NAME}" \
      --runtime nodejs20.x \
      --handler "${HANDLER}" \
      --timeout 30 \
      --environment "Variables={${ENV_VARS}}" >/dev/null
  else
    awslocal lambda create-function \
      --function-name "${FUNCTION_NAME}" \
      --runtime nodejs20.x \
      --handler "${HANDLER}" \
      --timeout 30 \
      --role "arn:aws:iam::${ACCOUNT_ID}:role/lambda-role" \
      --environment "Variables={${ENV_VARS}}" \
      --zip-file "fileb://${ZIP_PATH}" >/dev/null
  fi
}

ensure_event_source_mapping() {
  FUNCTION_NAME="$1"
  EVENT_SOURCE_ARN="$2"
  BATCH_SIZE="$3"

  if ! awslocal lambda list-event-source-mappings \
    --function-name "${FUNCTION_NAME}" \
    --event-source-arn "${EVENT_SOURCE_ARN}" \
    --query 'EventSourceMappings[0].UUID' \
    --output text 2>/dev/null | grep -vq '^None$'; then
    awslocal lambda create-event-source-mapping \
      --function-name "${FUNCTION_NAME}" \
      --batch-size "${BATCH_SIZE}" \
      --event-source-arn "${EVENT_SOURCE_ARN}" >/dev/null
  fi
}

echo "[localstack-init] cleaning legacy cache resources"
delete_event_source_mappings_for_function "${LEGACY_CACHE_LAMBDA}"
awslocal_safe lambda delete-function --function-name "${LEGACY_CACHE_LAMBDA}"
awslocal_safe sqs delete-queue --queue-url "http://localhost:4566/000000000000/${LEGACY_CACHE_QUEUE}"
awslocal_safe dynamodb delete-table --table-name "${LEGACY_LOCKER_CACHE_TABLE}"

echo "[localstack-init] creating sqs queues"
ensure_queue "${OPERATIONS_QUEUE}"
ensure_queue "${CACHE_PROJECTION_QUEUE}"

echo "[localstack-init] creating dynamodb tables"
ensure_dynamodb_table "${OPERATIONS_TABLE}" "operationId"
ensure_dynamodb_table "${LOCKER_CACHE_TABLE}" "lockerBoxId"
ensure_booking_table

echo "[localstack-init] packaging lambda"
python3 - <<'PY'
import pathlib
import zipfile

source_root = pathlib.Path("/opt/locker-localstack/ts-lambda")
if not source_root.exists():
    raise SystemExit("Missing mounted ts lambda directory: /opt/locker-localstack/ts-lambda")
required_paths = [source_root / "dist", source_root / "node_modules"]

missing = [str(path) for path in required_paths if not path.exists()]
if missing:
    raise SystemExit(f"Missing lambda build artifacts: {', '.join(missing)}")

packages = [
    (
        pathlib.Path("/etc/localstack/init/ready.d"),
        pathlib.Path("/tmp/operations-handler.zip"),
        {
            "functions/operations-handler.js",
        },
    ),
    (
        pathlib.Path("/opt/locker-localstack/ts-lambda"),
        pathlib.Path("/tmp/cache-projection-handler.zip"),
        {
            "dist/functions/cache",
            "dist/db",
            "dist/types",
            "node_modules",
            "package.json",
            "package-lock.json",
        },
    ),
]

for source_dir, zip_path, allowed_prefixes in packages:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in source_dir.rglob("*"):
            if path.is_file():
                relative = path.relative_to(source_dir)
                relative_str = relative.as_posix()
                if any(
                    relative_str == prefix or relative_str.startswith(f"{prefix}/")
                    for prefix in allowed_prefixes
                ):
                    zf.write(path, relative)

with zipfile.ZipFile(pathlib.Path("/tmp/operations-handler.zip"), "a", zipfile.ZIP_DEFLATED) as zf:
    for path in source_root.rglob("*"):
        if path.is_file():
            relative = path.relative_to(source_root)
            relative_str = relative.as_posix()
            if not (
                relative_str.startswith("node_modules/")
                and not any(
                    relative_str == prefix or relative_str.startswith(f"{prefix}/")
                    for prefix in {
                        "node_modules/@prisma",
                        "node_modules/.prisma",
                        "node_modules/prisma",
                        "node_modules/typescript",
                        "node_modules/@types",
                        "node_modules/fsevents",
                        "node_modules/undici-types",
                    }
                )
            ):
                continue

            if relative_str.endswith(".map"):
                continue

            zf.write(path, relative)
PY

echo "[localstack-init] creating operations lambda function"
ensure_lambda_function \
  "${OPERATIONS_LAMBDA}" \
  "functions/operations-handler.handler" \
  "${OPERATIONS_ZIP_PATH}" \
  "OPERATIONS_TABLE=${OPERATIONS_TABLE},BOOKINGS_TABLE=${BOOKINGS_TABLE},LOCKER_CACHE_TABLE=${LOCKER_CACHE_TABLE},AWS_REGION=${AWS_REGION}"

OPERATIONS_QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${OPERATIONS_QUEUE}"

echo "[localstack-init] binding operations sqs to lambda"
ensure_event_source_mapping "${OPERATIONS_LAMBDA}" "${OPERATIONS_QUEUE_ARN}" 1

echo "[localstack-init] creating cache projection lambda function"
ensure_lambda_function \
  "${CACHE_PROJECTION_LAMBDA}" \
  "dist/functions/cache/cacheProjectionHandler.handler" \
  "${CACHE_PROJECTION_ZIP_PATH}" \
  "LOCKER_CACHE_TABLE=${LOCKER_CACHE_TABLE},AWS_REGION=${AWS_REGION}"

CACHE_PROJECTION_QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${CACHE_PROJECTION_QUEUE}"

echo "[localstack-init] binding cache projection sqs to lambda"
ensure_event_source_mapping "${CACHE_PROJECTION_LAMBDA}" "${CACHE_PROJECTION_QUEUE_ARN}" 10

echo "[localstack-init] done"
