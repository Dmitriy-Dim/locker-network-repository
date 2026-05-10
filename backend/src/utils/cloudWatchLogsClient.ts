import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

import { env } from "../config/env";

import { baseCredentialsProvider, createRoleAwareProvider } from "./awsClient";

const cloudWatchLogsCredentials = createRoleAwareProvider(
    env.CLOUDWATCH_LOGS_ROLE_ARN || env.AWS_ROLE_ARN,
    env.CLOUDWATCH_LOGS_ROLE_SESSION_NAME || env.AWS_ROLE_SESSION_NAME || "locker-backend-cloudwatch-logs"
);

export const cloudWatchLogsClient = new CloudWatchLogsClient({
    region: env.AWS_REGION,
    credentials: cloudWatchLogsCredentials,
    endpoint: env.AWS_ENDPOINT_URL,
});

export async function assertCloudWatchLogsCredentialsConfigured() {
    await baseCredentialsProvider();
    await cloudWatchLogsCredentials();
}
