import {z} from 'zod';
export const attachmentsSchema=z.array(z.object({name:z.string().min(1).max(120),useAs:z.enum(['asset','reference']).optional(),optimized:z.boolean().optional(),dataUrl:z.string().max(400000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)})).max(3).default([]);
export type ImageAttachment=z.infer<typeof attachmentsSchema>[number];
// Preserve small uploads byte-for-byte, including transparency. Larger copies are explicitly labelled optimized.
export async function prepareImage(file:File):Promise<ImageAttachment>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG, or WebP image.');
 if(file.size>15*1024*1024)throw new Error('Each original image must be under 15 MB.');
 const original=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)});
 const image=await createImageBitmap(file);
 if(original.length<=400000){image.close();return attachmentsSchema.parse([{name:file.name.slice(0,120),dataUrl:original,useAs:/screenshot|screen shot|screen capture/i.test(file.name)?'reference':'asset',optimized:false}])[0];}
 try{
  const scale=Math.min(1,1024/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image preparation is unavailable in this browser.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let dataUrl=canvas.toDataURL('image/webp',.9);if(dataUrl.length>400000)dataUrl=canvas.toDataURL('image/webp',.7);
  if(dataUrl.length>400000)throw new Error('This image is too detailed. Crop it or choose a smaller image.');
  return attachmentsSchema.parse([{name:file.name.slice(0,120)||'Reference image',dataUrl,useAs:/screenshot|screen shot|screen capture/i.test(file.name)?'reference':'asset',optimized:true}])[0];
 }finally{image.close()}
}
