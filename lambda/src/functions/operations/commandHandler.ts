import { SQSEvent } from 'aws-lambda';
import { SQSCommand, OperationType, OperationStatus, LockerCommand } from '../../types/contracts/OperationContracts';
import { SecurityEventPayload } from '../../types/contracts/SecurityEventContracts';
import { updateOperationStatus } from '../../db/dynamodb';
import { handleHealthCheck } from './lambdaHealthService';
import { handleSecurityEvent } from './securityEventService';
import { handlePaymentConfirm } from '../booking/paymentConfirmService';
import { BookingInitCommand, PaymentConfirmCommand, BookingExtendCommand } from '../../types/contracts/BookingContracts';
import { handleBookingExtend } from '../booking/bookingExtendService';
import { handleBookingInit } from '../booking/bookingInitService';
import { handleLockerOpen, handleLockerClose } from './lockerCommandService';

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const command: SQSCommand = JSON.parse(record.body);
 
    console.log(JSON.stringify({
      action: 'COMMAND_RECEIVED',
      operationId: command.operationId,
      type: command.type,
      timestamp: new Date().toISOString(),
    }));
 
    try {
      await updateOperationStatus(command.operationId, OperationStatus.PROCESSING);
 
      switch (command.type) {
        case OperationType.HEALTH_CHECK:
          await handleHealthCheck(command.operationId);
          break;
 
        case OperationType.SECURITY_EVENT:
          await handleSecurityEvent(
            command.operationId,
            command.payload as unknown as SecurityEventPayload,
          );
          break;

        case OperationType.BOOKING_INIT:
          await handleBookingInit(command as unknown as BookingInitCommand);
          break;
 
        case OperationType.PAYMENT_CONFIRM:
          await handlePaymentConfirm(command as unknown as PaymentConfirmCommand);
          break;
 
        case OperationType.BOOKING_EXTEND:
          await handleBookingExtend(command as unknown as BookingExtendCommand);
          break;

        case OperationType.LOCKER_OPEN:
          await handleLockerOpen(command as unknown as LockerCommand);
          break;

        case OperationType.LOCKER_CLOSE:
          await handleLockerClose(command as unknown as LockerCommand);
          break;

        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
 
      console.log(JSON.stringify({
        action: 'COMMAND_COMPLETED',
        operationId: command.operationId,
        type: command.type,
      }));
 
    } catch (err) {
      console.error(JSON.stringify({
        action: 'COMMAND_FAILED',
        operationId: command.operationId,
        type: command.type,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
 
      await updateOperationStatus(
        command.operationId,
        OperationStatus.FAILED,
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }
};