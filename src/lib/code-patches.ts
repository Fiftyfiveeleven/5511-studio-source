import {fullstackPath} from './fullstack-project';
import {z} from 'zod';
import type {SourceFile} from './types';
export const sourcePathSchema=z.string().max(180).refine(value=>fullstackPath.test(value)||/^(?:index\.html|styles\.css|app\.js|(?:components|lib)\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:js|css))$/.test(value));
export const patchSchema=z.object({path:sourcePathSchema,find:z.string().min(1).max(160000),replace:z.string().max(160000)});
export function applyPatches(files:SourceFile[],patches:z.infer<typeof patchSchema>[]){const result=files.map(f=>({...f}));for(const patch of patches){patchSchema.parse(patch);const file=result.find(f=>f.path===patch.path);if(!file)throw new Error(`Patch target missing: ${patch.path}`);const first=file.content.indexOf(patch.find);if(first<0||file.content.indexOf(patch.find,first+1)>=0)throw new Error(`Patch must match exactly once: ${patch.path}`);file.content=file.content.slice(0,first)+patch.replace+file.content.slice(first+patch.find.length);}return result;}
