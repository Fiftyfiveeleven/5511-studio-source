import {z} from 'zod';
export const specificationSchema=z.object({purpose:z.string().max(3000).default(''),brand:z.string().max(2000).default(''),pages:z.string().max(3000).default(''),data:z.string().max(3000).default(''),decisions:z.string().max(3000).default('')});
export type ProjectSpecification=z.infer<typeof specificationSchema>;
export const stageSchema=z.object({id:z.uuid(),title:z.string().max(100),instruction:z.string().min(5).max(6000),status:z.enum(['pending','running','saved','failed']).default('pending'),revisionId:z.uuid().nullable().default(null)});
export const buildPlanSchema=z.object({id:z.uuid(),goal:z.string().max(6000),baseRevision:z.uuid().nullable(),stages:z.array(stageSchema).min(1).max(5),budgetUsd:z.number().min(0.1).max(100),allowRepair:z.boolean(),repairUsed:z.boolean().default(false),repairId:z.uuid().nullable().default(null),status:z.enum(['ready','running','paused','failed','complete']).default('ready'),verification:z.string().max(6000).default(''),createdAt:z.string()});
export type BuildPlan=z.infer<typeof buildPlanSchema>;
export function makeBuildPlan(goal:string,isNew:boolean,staged:boolean,budgetUsd=3):BuildPlan{
 const instruction=goal.slice(0,4500);
 const tasks=staged?[['Structure & components','Implement the page structure, reusable component boundaries, navigation targets and visual foundation. Keep unfinished features clearly labelled.'],['Working features','Implement the requested interactions and data integration on the existing foundation. Preserve the component structure. Never pretend backend actions succeeded.'],['Polish & accessibility','Complete responsive styling, labels, empty/error states, and verify all local navigation targets. Preserve working features.']]:[['Requested change','Implement the requested change while preserving other behavior.']];
 return {id:crypto.randomUUID(),goal,baseRevision:null,stages:tasks.map(([title,task])=>({id:crypto.randomUUID(),title,instruction:staged?`${task}\nOverall requirement: ${instruction}`:goal,status:'pending',revisionId:null})),budgetUsd,allowRepair:false,repairUsed:false,repairId:null,status:'ready',verification:'',createdAt:new Date().toISOString()};
}
