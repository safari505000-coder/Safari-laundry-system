export type BiometricAction = 'CHECK_IN' | 'CHECK_OUT';
export declare class BiometricEventDto {
    civilId?: string;
    externalUserRef?: string;
    action: BiometricAction;
    atIso: string;
    deviceId: string;
    meta?: string;
}
