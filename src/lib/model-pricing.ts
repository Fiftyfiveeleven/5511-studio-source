import type {TokenUsage} from './usage-types';
// Standard USD rates per million tokens, checked against official model docs 2026-09-14.
export const PRICING_DATE='2026-09-14';
export function modelPrice(model:string){
 if(/^gpt-5\.5(?:-\d{4}-\d{2}-\d{2})?$/.test(model))return {input:5,cached:0.5,output:30};
 if(/^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(model))return {input:0.75,cached:0.075,output:4.5};
 throw new Error(`No verified price configured for ${model}. Use a supported Studio model before building.`);
}
export function usageCost(model:string,usage:TokenUsage){const p=modelPrice(model);return Math.ceil(((Math.max(0,usage.input-usage.cachedInput)*p.input)+usage.cachedInput*p.cached+usage.output*p.output))/1e6;}
export function reserveCost(model:string,input:number,output:number){const p=modelPrice(model);return Math.ceil(input*p.input+output*p.output)/1e6;}
