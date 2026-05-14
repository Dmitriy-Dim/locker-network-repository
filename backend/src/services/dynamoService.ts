import {
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    UpdateCommand
} from "@aws-sdk/lib-dynamodb";

import {dynamoDocClient} from "../utils/awsClient";
import {env} from "../config/env";
import {LockerCacheDto} from "../contracts/cache.dto";

import {Operation, OperationStatus} from "./dto/operationDto";

const TABLE_NAME = env.DYNAMO_TABLE_NAME || "locker-dev-operations-dynamodb";
const BOOKINGS_TABLE_NAME = env.DYNAMO_BOOKINGS_TABLE_NAME || "locker-dev-bookings-dynamodb";
const LOCKER_CACHE_TABLE_NAME = env.DYNAMO_LOCKER_CACHE_TABLE_NAME || "locker-dev-locker-cache";

export async function createOperation(operation: Operation) {
    await dynamoDocClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            operationId: operation.operationId,
            ...(operation.userId ? {userId: operation.userId} : {}),
            type: operation.type,
            status: operation.status,
            timestamp: operation.timestamp,
            ...(operation.result ? {result: operation.result} : {}),
            ...(operation.errorMessage ? {errorMessage: operation.errorMessage} : {}),
        }
    }));
}

export async function getOperation(operationId: string) {
    const result = await dynamoDocClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {operationId}
    }));
    return result.Item;
}

export async function updateOperationStatus(
    operationId: string,
    status: OperationStatus,
    errorMessage?: string,
    result?: Record<string, unknown>
) {
    const expressions = ['SET #s = :status'];
    const names: Record<string, string> = {"#s": "status"};
    const values: Record<string, unknown> = {
        ':status': status,
    };

    if (errorMessage) {
        expressions.push('errorMessage = :err');
        values[':err'] = errorMessage;
    }

    if (result) {
        expressions.push('#result = :result');
        names['#result'] = 'result';
        values[':result'] = result;
    }

    await dynamoDocClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {operationId},
        UpdateExpression: expressions.join(', '),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
    }));
}

export async function getBooking(bookingId: string) {
    const result = await dynamoDocClient.send(new GetCommand({
        TableName: BOOKINGS_TABLE_NAME,
        Key: {bookingId}
    }));

    return result.Item;
}

export async function getLockerCache(lockerBoxId: string) {
    const result = await dynamoDocClient.send(new GetCommand({
        TableName: LOCKER_CACHE_TABLE_NAME,
        Key: {lockerBoxId}
    }));

    return result.Item as LockerCacheDto | undefined;
}

export async function getAllUserBookings(userId: string) {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
        const result = await dynamoDocClient.send(new QueryCommand({
            TableName: BOOKINGS_TABLE_NAME,
            IndexName: "userId",
            KeyConditionExpression: "userId = :userId",
            ExpressionAttributeValues: {
                ":userId": userId,
            },
            ExclusiveStartKey: exclusiveStartKey,
        }));

        items.push(...((result.Items ?? []) as Record<string, unknown>[]));
        exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return items;
}

export async function getAllBookings() {
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
        const result = await dynamoDocClient.send(new ScanCommand({
            TableName: BOOKINGS_TABLE_NAME,
            ExclusiveStartKey: exclusiveStartKey,
        }));
        items.push(...((result.Items ?? []) as Record<string, unknown>[]));
        exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
    return items;
}