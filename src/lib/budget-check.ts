import type {UsageSummary} from './usage-types';
export function budgetBlock(usage:UsageSummary,reservedTokens:number,reservedUsd:number,now=Date.now()){
 const recent=usage.entries.filter(e=>Date.parse(e.createdAt)>now-86400000);
 const spent=recent.reduce((n,e)=>n+(e.usage?.total??e.reservation),0);
 const remaining=Math.max(0,usage.limits.dailyTokens-spent);
 if(recent.length>=usage.limits.dailyBuilds)return 'Your daily request allowance is used. Wait for earlier requests to leave the rolling 24-hour window, or review Usage & limits. No AI request was sent.';
 if(reservedTokens>remaining)return `Daily token allowance: ${remaining.toLocaleString('en-US')} available; this change needs room for up to ${reservedTokens.toLocaleString('en-US')}. Wait for earlier usage to leave the 24-hour window, or review Usage & limits. No AI request was sent.`;
 if(reservedUsd>Math.max(0,(usage.limits.monthlyUsd??100)-(usage.monthUsd??0)-(usage.monthReservedUsd??0)))return 'This change would exceed your monthly spending limit. Review Usage & limits. No AI request was sent.';
 if(reservedUsd>(usage.limits.maxBuildUsd??3))return 'This change would exceed your per-build spending limit. Review Usage & limits. No AI request was sent.';
 return null;
}
