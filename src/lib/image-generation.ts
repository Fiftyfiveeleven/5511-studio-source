import OpenAI from 'openai';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {beginUsage,recordUsage} from './usage-store';
export const IMAGE_MODEL='gpt-image-2.5-sunburst';
export const imageGenerationSchema=z.object({requestId:z.uuid(),label:z.string().trim().min(1).max(100),prompt:z.string().trim().min(5).max(4000),size:z.enum(['1024x1024','1536x1024','1024x1536']).default('1024x1024'),quality:z.enum(['low','medium','high']).default('medium')});
export async function optimizeGeneratedImage(original:string){
 const bytes=Buffer.from(original,'base64');
 for(const quality of [85,65,45]){const out=await sharp(bytes,{limitInputPixels:16000000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality}).toBuffer();const dataUrl='data:image/webp;base64,'+out.toString('base64');if(dataUrl.length<=350000)return dataUrl;}
 const out=await sharp(bytes,{limitInputPixels:16000000}).resize({width:768,height:768,fit:'inside'}).webp({quality:40}).toBuffer();const result='data:image/webp;base64,'+out.toString('base64');if(result.length>400000)throw new Error('Image could not be prepared for the builder.');return result;
}
export async function generateProjectImage(key:string,projectId:string,input:z.infer<typeof imageGenerationSchema>){
 const digest=createHash('sha256').update(JSON.stringify({projectId,...input,model:IMAGE_MODEL})).digest('hex');
 await beginUsage(key,{id:input.requestId,projectId,name:'Create image: '+input.label,createdAt:new Date().toISOString(),model:IMAGE_MODEL,status:'running',usage:null,reservation:30000,reservedUsd:1,reused:0,digest,buildId:input.requestId,buildBudgetUsd:1});
 let received=false;
 try{
 const response=await new OpenAI({apiKey:key,maxRetries:0,timeout:180000}).images.generate({model:IMAGE_MODEL,prompt:input.prompt,size:input.size,quality:input.quality,n:1,output_format:'webp',output_compression:90});
 const u=response.usage;const usage=u?{input:u.input_tokens,cachedInput:0,output:u.output_tokens,reasoning:0,total:u.total_tokens}:null;
 const costUsd=u?((u.input_tokens_details?.text_tokens??u.input_tokens)*5+(u.input_tokens_details?.image_tokens??0)*8+u.output_tokens*30)/1e6:null;
 await recordUsage(key,input.requestId,{usage,...(costUsd!==null?{costUsd}:{} )});received=true;
 const bytes=response.data?.[0]?.b64_json;if(!bytes||bytes.length>12000000)throw new Error('No supported image returned.');
 const dataUrl=await optimizeGeneratedImage(bytes);
 await recordUsage(key,input.requestId,{status:'completed'});
 return {data_url:dataUrl,original_data_url:'data:image/webp;base64,'+bytes,cost_usd:costUsd};
 }catch(e){await recordUsage(key,input.requestId,{status:received?'failed':'uncertain',error:'Image generation did not finish; no automatic retry.'});throw e;}
}
