import { OperationType } from '../../types/contracts/OperationContracts';
import { LockerErrorCode, LockStatus, DoorStatus } from '../../types/contracts/LockerContracts';

export interface DeviceSimulationResult {
  success: boolean;
  lockStatus: LockStatus;
  doorStatus: DoorStatus;
  message?: string;
  nextAction?: 'CHANGE_LOCKER';
  errorCode?: LockerErrorCode;
  errorMessage?: string;
}

// Simulates network RTT to an IoT gateway. Replace with actual HTTP call in production:
// const res = await fetch(`https://iot-gateway/device/${lockerBoxId}/command`, { method: 'POST', body: JSON.stringify({ command }) })
const simulateRtt = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));

export const simulateDeviceCommand = async (
  lockerBoxId: string,
  operation: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE,
): Promise<DeviceSimulationResult> => {
  await simulateRtt();

  const rand = Math.random();

  if (operation === OperationType.LOCKER_OPEN) {
    if (rand < 0.8) {
      return { success: true, lockStatus: 'UNLOCKED', doorStatus: 'OPEN', message: 'Locker opened' };
    }
    if (rand < 0.9) {
      return {
        success: false,
        lockStatus: 'LOCKED',
        doorStatus: 'CLOSED',
        nextAction: 'CHANGE_LOCKER',
        errorCode: LockerErrorCode.LOCK_OPEN_FAILED,
        errorMessage: 'Locker lock failed to unlock',
      };
    }
    return {
      success: false,
      lockStatus: 'UNLOCKED',
      doorStatus: 'CLOSED',
      nextAction: 'CHANGE_LOCKER',
      errorCode: LockerErrorCode.DOOR_OPEN_FAILED,
      errorMessage: 'Locker door failed to open',
    };
  }

  // LOCKER_CLOSE
  if (rand < 0.85) {
    return { success: true, lockStatus: 'LOCKED', doorStatus: 'CLOSED', message: 'Locker closed' };
  }
  if (rand < 0.925) {
    return {
      success: false,
      lockStatus: 'UNLOCKED',
      doorStatus: 'CLOSED',
      errorCode: LockerErrorCode.LOCK_CLOSE_FAILED,
      errorMessage: 'Locker lock failed to engage',
    };
  }
  return {
    success: false,
    lockStatus: 'UNLOCKED',
    doorStatus: 'OPEN',
    errorCode: LockerErrorCode.DOOR_CLOSE_FAILED,
    errorMessage: 'Locker door failed to close',
  };
};
