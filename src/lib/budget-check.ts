import type {UsageSummary} from './usage-types';
// Kept as a compatibility hook for preflight callers. Usage is tracking-only.
export function budgetBlock(_usage:UsageSummary,_reservedTokens:number,_reservedUsd:number,_now=Date.now()):string|null{return null;}
