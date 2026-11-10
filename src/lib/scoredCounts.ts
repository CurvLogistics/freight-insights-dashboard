/** "13 of 45 scored": an on-time % is only as good as how many loads it covers. */
export const scoredOf = (scored: number, total: number) =>
    `${scored.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} scored`;

/** Under half the loads scored (e.g. recent days still in transit): flag the % as provisional. */
export const lowCoverage = (scored: number, total: number) => total > 0 && scored / total < 0.5;