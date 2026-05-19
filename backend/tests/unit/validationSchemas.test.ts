import {
    googleLoginSchema,
    loginSchema,
    refreshSchema,
    signupSchema,
    updatePasswordSchema,
} from "../../src/validation/authSchemas";
import {
    bookingInitSchema,
    bookingStatusChangeSchema,
    extendBookingSchema,
    oneBookingSchema,
} from "../../src/validation/bookingSchemas";
import { createCitySchema } from "../../src/validation/citiesSchema";
import {
    changeStatusLockerSchema,
    changeTechStatusLockerSchema,
    createLockerSchema,
    getLockersWithParamsSchema,
    oneLockerSchema,
} from "../../src/validation/lockersSchema";
import { changePriceSchema, createPriceSchema } from "../../src/validation/pricingSchema";
import {
    changeStatusStationSchema,
    createStationSchema,
    getStationsWithParamsSchema,
    oneStationSchema,
} from "../../src/validation/stationSchemas";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("auth validation schemas", () => {
    it("accepts valid auth payloads", () => {
        expect(signupSchema.safeParse({
            body: {
                name: "Test User",
                email: "user@example.com",
                password: "StrongPass1!",
                phone: "+972501234567",
            },
        }).success).toBe(true);
        expect(loginSchema.safeParse({ body: { email: "user@example.com", password: "x" } }).success).toBe(true);
        expect(googleLoginSchema.safeParse({ body: { idToken: "token" } }).success).toBe(true);
        expect(refreshSchema.safeParse({ cookies: { refreshToken: "refresh" } }).success).toBe(true);
        expect(updatePasswordSchema.safeParse({ body: { passwordCurrent: "old", newPassword: "StrongPass1!" } }).success).toBe(true);
    });

    it("rejects weak passwords and invalid email", () => {
        expect(signupSchema.safeParse({
            body: {
                name: "A",
                email: "bad",
                password: "weak",
            },
        }).success).toBe(false);
    });
});

describe("booking validation schemas", () => {
    it("accepts valid booking payloads", () => {
        const validFutureEndTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        expect(bookingInitSchema.safeParse({
            body: {
                stationId: uuid,
                size: "M",
                expectedEndTime: validFutureEndTime,
            },
        }).success).toBe(true);
        expect(oneBookingSchema.safeParse({ params: { id: uuid } }).success).toBe(true);
        expect(extendBookingSchema.safeParse({
            params: { id: uuid },
            body: { expectedEndTime: "2026-04-30T10:00:00.000Z" },
        }).success).toBe(true);
        expect(bookingStatusChangeSchema.safeParse({
            params: { id: uuid },
            body: { status: "ACTIVE" },
        }).success).toBe(true);
    });

    it("rejects invalid booking ids and datetime", () => {
        expect(bookingInitSchema.safeParse({
            body: {
                stationId: "bad",
                size: "XL",
                expectedEndTime: "tomorrow",
            },
        }).success).toBe(false);
    });
});

describe("locker validation schemas", () => {
    it("accepts current locker tech statuses without READY", () => {
        for (const techStatus of ["ACTIVE", "INACTIVE", "MAINTENANCE", "FAULTY"]) {
            expect(changeTechStatusLockerSchema.safeParse({
                params: { id: uuid },
                body: { techStatus },
            }).success).toBe(true);
        }
    });

    it("rejects removed READY locker tech status", () => {
        expect(changeTechStatusLockerSchema.safeParse({
            params: { id: uuid },
            body: { techStatus: "READY" },
        }).success).toBe(false);
    });

    it("accepts locker creation and query schemas", () => {
        expect(createLockerSchema.safeParse({
            body: { stationId: uuid, code: "A-01", size: "S" },
        }).success).toBe(true);
        expect(getLockersWithParamsSchema.safeParse({
            query: { stationId: uuid, size: "L", status: "AVAILABLE" },
        }).success).toBe(true);
        expect(oneLockerSchema.safeParse({ params: { id: uuid } }).success).toBe(true);
        expect(changeStatusLockerSchema.safeParse({
            params: { id: uuid },
            body: { status: "AVAILABLE" },
        }).success).toBe(true);
    });
});

describe("station, pricing, and city validation schemas", () => {
    it("accepts valid station, pricing, and city payloads", () => {
        expect(createStationSchema.safeParse({
            body: { city: "Tel Aviv", latitude: "32.08", longitude: "34.78", address: "Dizengoff" },
        }).success).toBe(true);
        expect(getStationsWithParamsSchema.safeParse({
            query: { city: "Tel Aviv", lat: "32.08", lng: "34.78" },
        }).success).toBe(true);
        expect(oneStationSchema.safeParse({ params: { id: uuid } }).success).toBe(true);
        expect(changeStatusStationSchema.safeParse({ params: { id: uuid }, body: { status: "READY" } }).success).toBe(true);
        expect(createPriceSchema.safeParse({ body: { cityId: uuid, size: "M", pricePerHour: 12.5 } }).success).toBe(true);
        expect(changePriceSchema.safeParse({ params: { id: uuid }, body: { pricePerHour: 15 } }).success).toBe(true);
        expect(createCitySchema.safeParse({ body: { code: "TLV", name: "Tel Aviv" } }).success).toBe(true);
    });

    it("requires lat and lng together for station search", () => {
        expect(getStationsWithParamsSchema.safeParse({
            query: { lat: "32.08" },
        }).success).toBe(false);
    });
});
