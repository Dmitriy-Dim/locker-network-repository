import { BookingStatus, LockerStatus, Prisma } from "@prisma/client";

import { env } from "../config/env";
import { logger } from "../Logger/winston";
import { sanitizeAuditDetails } from "../utils/audit";

import { ActionType } from "./dto/operationDto";
import { prismaService } from "./prismaService";

type ExpiredBookingCandidate = {
    bookingId: string;
    lockerBoxId: string;
    expectedEndTime: Date | null;
    status: BookingStatus;
    lockerBox: {
        stationId: string;
        status: LockerStatus | null;
    };
};

type ExpiredBookingResult = {
    bookingId: string;
    lockerBoxId: string;
    previousBookingStatus: BookingStatus;
    previousLockerStatus: LockerStatus | null;
    expectedEndTime: Date | null;
};

function toAuditJson(value: unknown) {
    return sanitizeAuditDetails(value) as Prisma.InputJsonValue;
}

export class BookingExpirationService {
    private timer?: NodeJS.Timeout;
    private isRunning = false;

    async expireDueBookings(now = new Date(), batchSize = env.BOOKING_EXPIRATION_BATCH_SIZE) {
        if (this.isRunning) {
            return { expiredCount: 0, skipped: true };
        }

        this.isRunning = true;

        try {
            const candidates = await prismaService.booking.findMany({
                where: {
                    status: BookingStatus.ACTIVE,
                    expectedEndTime: {
                        not: null,
                        lte: now,
                    },
                },
                orderBy: {
                    expectedEndTime: "asc",
                },
                take: batchSize,
                select: {
                    bookingId: true,
                    lockerBoxId: true,
                    expectedEndTime: true,
                    status: true,
                    lockerBox: {
                        select: {
                            stationId: true,
                            status: true,
                        },
                    },
                },
            });

            const expired = await Promise.all(
                candidates.map((candidate) => this.expireOneBooking(candidate, now))
            );
            const changed = expired.filter((item): item is ExpiredBookingResult => item !== null);

            if (changed.length > 0) {
                logger.info("Expired active bookings in RDS", {
                    count: changed.length,
                    bookingIds: changed.map((item) => item.bookingId),
                });
            }

            return {
                expiredCount: changed.length,
                skipped: false,
            };
        } finally {
            this.isRunning = false;
        }
    }

    start() {
        if (this.timer) {
            return;
        }

        void this.expireDueBookings().catch((error) => {
            logger.error("Initial booking expiration job failed", {
                error: error instanceof Error ? error.message : "Unknown error",
            });
        });
        this.timer = setInterval(() => {
            void this.expireDueBookings().catch((error) => {
                logger.error("Booking expiration job failed", {
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            });
        }, env.BOOKING_EXPIRATION_INTERVAL_MS);
    }

    stop() {
        if (!this.timer) {
            return;
        }

        clearInterval(this.timer);
        this.timer = undefined;
    }

    private async expireOneBooking(candidate: ExpiredBookingCandidate, now: Date) {
        return prismaService.$transaction(async (tx) => {
            const updatedBooking = await tx.booking.updateMany({
                where: {
                    bookingId: candidate.bookingId,
                    status: BookingStatus.ACTIVE,
                    expectedEndTime: {
                        not: null,
                        lte: now,
                    },
                },
                data: {
                    status: BookingStatus.EXPIRED,
                    endTime: candidate.expectedEndTime ?? now,
                },
            });

            if (updatedBooking.count === 0) {
                return null;
            }

            await tx.auditLog.create({
                data: {
                    action: ActionType.BOOKING_EXPIRE,
                    entityType: "Booking",
                    entityId: candidate.bookingId,
                    lockerId: candidate.lockerBoxId,
                    details: toAuditJson({
                        source: "backend-booking-expiration-job",
                        previousBookingStatus: candidate.status,
                        nextBookingStatus: BookingStatus.EXPIRED,
                        previousLockerStatus: candidate.lockerBox.status,
                        lockerStatusOwner: "lambda",
                        expectedEndTime: candidate.expectedEndTime,
                        expiredAt: now,
                    }),
                },
            });

            return {
                bookingId: candidate.bookingId,
                lockerBoxId: candidate.lockerBoxId,
                previousBookingStatus: candidate.status,
                previousLockerStatus: candidate.lockerBox.status,
                expectedEndTime: candidate.expectedEndTime,
            };
        });
    }
}

export const bookingExpirationService = new BookingExpirationService();
