import { useState, useCallback } from 'react';
import { apiClient } from '../api/apiClient';

const PAYMENT_URL_STORAGE_KEY = 'booking_payment_urls';

export function savePaymentUrl(bookingId: string, paymentUrl: string) {
    try {
        const stored = JSON.parse(localStorage.getItem(PAYMENT_URL_STORAGE_KEY) || '{}');
        stored[bookingId] = paymentUrl;
        localStorage.setItem(PAYMENT_URL_STORAGE_KEY, JSON.stringify(stored));
    } catch {
        // ignore
    }
}

export function getPaymentUrl(bookingId: string): string | null {
    try {
        const stored = JSON.parse(localStorage.getItem(PAYMENT_URL_STORAGE_KEY) || '{}');
        return stored[bookingId] ?? null;
    } catch {
        return null;
    }
}

export function removePaymentUrl(bookingId: string) {
    try {
        const stored = JSON.parse(localStorage.getItem(PAYMENT_URL_STORAGE_KEY) || '{}');
        delete stored[bookingId];
        localStorage.setItem(PAYMENT_URL_STORAGE_KEY, JSON.stringify(stored));
    } catch {
        // ignore
    }
}

export function useBooking() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pollOperation = useCallback((operationId: string, expectedType: string = 'BOOKING_INIT'): Promise<any> => {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 30;

            console.log(`>>> ЗАПУСК ПУЛЛИНГА: ID=${operationId}, Ожидаемый тип=${expectedType}`);

            const interval = setInterval(async () => {
                try {
                    attempts++;
                    const response = await apiClient.get(`/operations/${operationId}`);
                    const op = response.data?.data || response.data;

                    console.log(`--- [Попытка ${attempts}] Тип: ${op?.type}, Статус: ${op?.status}`);

                    if (op?.type === expectedType) {
                        if (op?.status === 'SUCCESS') {
                            clearInterval(interval);
                            resolve(op);
                        } else if (op?.status === 'FAILED') {
                            clearInterval(interval);
                            reject(new Error(op.errorMessage || "Operation failed on backend"));
                        }
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        reject(new Error("Polling timeout"));
                    }
                } catch (err: any) {
                    console.error("Ошибка сети при пуллинге:", err.response?.data || err.message);
                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        reject(new Error("Polling error and timeout"));
                    }
                }
            }, 2000);
        });
    }, []);

    const startBookingFlow = async ({ stationId, size, expectedEndTime }: { stationId: string, size: string, expectedEndTime: string }) => {
        try {
            setIsLoading(true);
            setError(null);

            const bookingPayload = { stationId, size, expectedEndTime };

            console.log(">>> [1] ИНИЦИАЛИЗАЦИЯ: POST /bookings/init");
            console.log("Payload:", bookingPayload);

            const response = await apiClient.post('/bookings/init', bookingPayload);
            const operationId = response.data?.data?.operationId || response.data?.operationId;

            if (!operationId) throw new Error("No operationId received");

            const op = await pollOperation(operationId, 'BOOKING_INIT');
            const paymentUrl = op.payment?.paymentUrl || op.result?.payment?.paymentUrl || op.result?.paymentUrl || op.paymentUrl;

            if (paymentUrl) {
                const bookingId = op.data?.bookingId || op.bookingId || op.result?.bookingId;
                if (bookingId) {
                    savePaymentUrl(bookingId, paymentUrl);
                    console.log(` paymentUrl сохранён для bookingId=${bookingId}`);
                }

                console.log(" URL ОПЛАТЫ:", paymentUrl);
                window.location.href = paymentUrl;
            } else {
                throw new Error("Payment URL missing from success response");
            }

        } catch (err: any) {
            console.error("!!! ОШИБКА ФЛОУ:", err.message);
            setError(err.message);
            setIsLoading(false);
        }
    };

    return {
        startBookingFlow,
        pollOperation,
        isLoading,
        error
    };
}