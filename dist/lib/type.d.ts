export type ConsumerOptions = {
    retry: boolean;
    retry_count: number;
    retry_delay: number;
    /**
     * Most unacknowledged messages this consumer holds at once, which is how many
     * it works on concurrently. Omit (or 0) for no limit: the broker then pushes
     * the whole queue to the process in one go.
     */
    prefetch?: number;
};
