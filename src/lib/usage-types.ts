export type TokenUsage={input:number;cachedInput:number;output:number;reasoning:number;total:number};
export type Limits={dailyTokens:number;maxOutputTokens:number;maxInputCharacters:number;dailyBuilds:number;monthlyUsd?:number;maxBuildUsd?:number};
export const defaultLimits:Limits={dailyTokens:150000,maxOutputTokens:12000,maxInputCharacters:90000,dailyBuilds:20,monthlyUsd:100,maxBuildUsd:3};
export type UsageEntry={id:string;projectId:string;name:string;createdAt:string;model:string;status:'running'|'completed'|'failed'|'uncertain';usage:TokenUsage|null;reservation:number;reused:number;error?:string;costUsd?:number;reservedUsd?:number;buildId?:string;buildBudgetUsd?:number;routing?:import('./build-routing').RoutingInfo};
export type UsageSummary={limits:Limits;entries:UsageEntry[];today:TokenUsage;reserved:number;allTime:TokenUsage;monthUsd?:number;monthReservedUsd?:number};
