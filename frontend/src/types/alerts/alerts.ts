export interface SecurityAlert {
    id?: string;
    category: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    eventType: string;
    reason: string;
    source: string;
    environment: string;
    timestamp: string;
    actorId?: string;
    details?: Record<string, any>;
}
