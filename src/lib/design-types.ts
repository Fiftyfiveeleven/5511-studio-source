import {z} from 'zod';
export const designChangeSchema=z.object({id:z.string().max(220),property:z.enum(['text','href','src','alt','color','backgroundColor','fontSize','fontWeight','textAlign','padding','margin','borderRadius','gap']),value:z.string().max(10000)});
export type DesignChange=z.infer<typeof designChangeSchema>;
export type DesignElement={id:string;path:string;tag:string;label:string;text:string|null;attributes:Record<string,string>;styles:Record<string,string>;styleEditable:boolean};
export const styleProperties=['color','backgroundColor','fontSize','fontWeight','textAlign','padding','margin','borderRadius','gap'] as const;
export function validateDesignValue(change:DesignChange){
 const {property,value}=designChangeSchema.parse(change);
 if(property==='href'||property==='src'){
  if(value&&!/^(?:https:\/\/[^\s]+|\/(?!\/)[^\s]*|#[^\s]*|mailto:[^\s]+|tel:[+\d ()-]+)$/.test(value))throw new Error('Use an HTTPS URL, local path, anchor, email or telephone link.');
  if(property==='src'&&/^(mailto:|tel:|#)/.test(value))throw new Error('Use an HTTPS image URL or local image path.');
 }else if((styleProperties as readonly string[]).includes(property)&&(!/^[#a-zA-Z0-9.% (),-]{0,120}$/.test(value)||/url|expression|javascript/i.test(value)))throw new Error('Use a simple CSS value such as #00a3cc, 24px or 1.5rem.');
 return change;
}

export const designAuditSchema=z.object({viewport:z.object({width:z.number().positive().max(20000),height:z.number().positive().max(20000)}),url:z.string().max(2000),checkedAt:z.string().max(60),findings:z.array(z.object({category:z.string().max(100),element:z.string().max(220),message:z.string().max(1000),fix:z.string().max(1000)})).max(40)});
