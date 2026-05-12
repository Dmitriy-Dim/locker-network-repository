
export class HttpError extends Error {
    constructor(
        public status: number,
        public message: string,
        public code = "HTTP_ERROR",
        public details?: unknown,
        public expose = false
    ) {
        super(message);
    }
}
