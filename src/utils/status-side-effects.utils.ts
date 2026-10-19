type StatusSideEffect = () => Promise<unknown> | unknown;

/**
 * Starts non-critical status notifications without delaying the HTTP response.
 * Persistence and audit writes must finish before this is called; email and
 * push delivery are best-effort follow-up work.
 */
export function dispatchStatusSideEffects(tasks: StatusSideEffect[]): void {
    for (const task of tasks) {
        void Promise.resolve()
            .then(task)
            .catch((error) => {
                console.error("Order status side effect failed:", error);
            });
    }
}
