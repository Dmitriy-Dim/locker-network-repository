import { OperationType } from '../../types/contracts/OperationContracts';
import { LockerErrorCode, LockStatus, DoorStatus } from '../../types/contracts/LockerContracts';
import { getLockerDeviceState, updateLockerDeviceState } from '../../db/dynamodb';

export interface DeviceSimulationResult {
  success: boolean;
  lockStatus: LockStatus;
  doorStatus: DoorStatus;
  message?: string;
  nextAction?: 'CHANGE_LOCKER';
  errorCode?: LockerErrorCode;
  errorMessage?: string;
}

// Simulates network RTT to an IoT gateway.
// In production replace with: await fetch(`https://iot-gateway/device/${lockerBoxId}/command`, { method: 'POST', body: JSON.stringify({ command }) })
const simulateRtt = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));

// Determines what state the mechanism ends up in after actuation (random outcome).
// In production this write is done by the physical device sensor itself.
const simulateSensorWrite = async (
  lockerBoxId: string,
  operation: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE,
): Promise<void> => {
  const rand = Math.random();

  let newLock: LockStatus;
  let newDoor: DoorStatus;

  if (operation === OperationType.LOCKER_OPEN) {
    if (rand < 0.8)      { newLock = 'UNLOCKED'; newDoor = 'OPEN'; }   // success
    else if (rand < 0.9) { newLock = 'LOCKED';   newDoor = 'CLOSED'; } // lock jammed
    else                 { newLock = 'UNLOCKED';  newDoor = 'CLOSED'; } // door jammed
  } else {
    if (rand < 0.85)      { newLock = 'LOCKED';   newDoor = 'CLOSED'; } // success
    else if (rand < 0.925){ newLock = 'UNLOCKED';  newDoor = 'CLOSED'; } // lock didn't engage
    else                  { newLock = 'UNLOCKED';  newDoor = 'OPEN'; }  // door didn't close
  }

  await updateLockerDeviceState(lockerBoxId, newLock, newDoor);
};

export const simulateDeviceCommand = async (
  lockerBoxId: string,
  operation: OperationType.LOCKER_OPEN | OperationType.LOCKER_CLOSE,
): Promise<DeviceSimulationResult> => {
  // Step 1: read what sensors report right now
  const currentState = await getLockerDeviceState(lockerBoxId);

  if (!currentState) {
    return {
      success: false,
      lockStatus: 'LOCKED',
      doorStatus: 'CLOSED',
      errorCode: LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage: 'No sensor record found for locker — device not initialised',
    };
  }

  if (!currentState.isOnline) {
    return {
      success: false,
      lockStatus: currentState.lockStatus,
      doorStatus: currentState.doorStatus,
      errorCode: LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage: 'Device is offline',
    };
  }

  // Step 2: validate sensor state matches the required pre-condition for the operation
  const expectLock: LockStatus = operation === OperationType.LOCKER_OPEN ? 'LOCKED'   : 'UNLOCKED';
  const expectDoor: DoorStatus = operation === OperationType.LOCKER_OPEN ? 'CLOSED'   : 'OPEN';

  if (currentState.lockStatus !== expectLock || currentState.doorStatus !== expectDoor) {
    return {
      success: false,
      lockStatus: currentState.lockStatus,
      doorStatus: currentState.doorStatus,
      errorCode: LockerErrorCode.LOCKER_STATE_INVALID,
      errorMessage: `Sensor pre-condition not met: expected lock=${expectLock} door=${expectDoor}, got lock=${currentState.lockStatus} door=${currentState.doorStatus}`,
    };
  }

  // Step 3: send command to device (network RTT)
  await simulateRtt();

  // Step 4: sensor detects mechanical result and writes new state to DB
  await simulateSensorWrite(lockerBoxId, operation);

  // Step 5: read back what sensor now reports — this is the source of truth
  const sensorState = await getLockerDeviceState(lockerBoxId);

  if (!sensorState) {
    return {
      success: false,
      lockStatus: 'LOCKED',
      doorStatus: 'CLOSED',
      errorCode: LockerErrorCode.DEVICE_SIMULATION_FAILED,
      errorMessage: 'Sensor state unavailable after command',
    };
  }

  // Step 6: evaluate result based on sensor reading
  if (operation === OperationType.LOCKER_OPEN) {
    if (sensorState.lockStatus === 'UNLOCKED' && sensorState.doorStatus === 'OPEN') {
      return { success: true, lockStatus: 'UNLOCKED', doorStatus: 'OPEN', message: 'Locker opened' };
    }
    if (sensorState.lockStatus === 'LOCKED') {
      return {
        success: false,
        lockStatus: sensorState.lockStatus,
        doorStatus: sensorState.doorStatus,
        nextAction: 'CHANGE_LOCKER',
        errorCode: LockerErrorCode.LOCK_OPEN_FAILED,
        errorMessage: 'Locker lock failed to unlock',
      };
    }
    return {
      success: false,
      lockStatus: sensorState.lockStatus,
      doorStatus: sensorState.doorStatus,
      nextAction: 'CHANGE_LOCKER',
      errorCode: LockerErrorCode.DOOR_OPEN_FAILED,
      errorMessage: 'Locker door failed to open',
    };
  }

  // LOCKER_CLOSE
  if (sensorState.lockStatus === 'LOCKED' && sensorState.doorStatus === 'CLOSED') {
    return { success: true, lockStatus: 'LOCKED', doorStatus: 'CLOSED', message: 'Locker closed' };
  }
  if (sensorState.doorStatus === 'CLOSED') {
    return {
      success: false,
      lockStatus: sensorState.lockStatus,
      doorStatus: sensorState.doorStatus,
      errorCode: LockerErrorCode.LOCK_CLOSE_FAILED,
      errorMessage: 'Locker lock failed to engage',
    };
  }
  return {
    success: false,
    lockStatus: sensorState.lockStatus,
    doorStatus: sensorState.doorStatus,
    errorCode: LockerErrorCode.DOOR_CLOSE_FAILED,
    errorMessage: 'Locker door failed to close',
  };
};
