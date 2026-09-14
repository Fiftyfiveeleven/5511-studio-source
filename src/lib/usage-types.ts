export type TokenUsage={input:number;cachedInput:number;output:number;reasoning:number;total:number};
export type Limits={dailyTokens:number;maxOutputTokens:number;maxInputCharacters:number;dailyBuilds:number};
export const defaultLimits:Limits={dailyTokens:150000,maxOutputTokens:12000,maxInputCharacters:90000,dailyBuilds:20};
export type UsageEntry={id:string;projectId:string;name:string;createdAt:string;model:string;status:'running'|'completed'|'failed'|'uncertain';usage:TokenUsage|null;reservation:number;reused:number;error?:string};
export type UsageSummary={limits:Limits;entries:UsageEntry[];today:TokenUsage;reserved:number;allTime:TokenUsage};
