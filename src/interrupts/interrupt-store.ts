type PendingInterrupt = {
    resolve: (value: string) => void;
    reject: (reason: string) => void;
};

const pending = new Map<string, PendingInterrupt>();

export function createInterruptRequest(requestId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
    });
}

export function resolveInterruptRequest(
    requestId: string,
    value: string,
): boolean {
    const entry = pending.get(requestId);
    if (!entry) return false;
    pending.delete(requestId);
    entry.resolve(value);
    return true;
}

export function cancelInterruptRequest(
    requestId: string,
    reason: string,
): boolean {
    const entry = pending.get(requestId);
    if (!entry) return false;
    pending.delete(requestId);
    entry.reject(reason);
    return true;
}

export function hasInterruptRequest(requestId: string): boolean {
    return pending.has(requestId);
}
