import {z} from 'zod';
export const attachmentsSchema=z.array(z.object({name:z.string().min(1).max(120),dataUrl:z.string().max(400000).regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/)})).max(3).default([]);
export type ImageAttachment=z.infer<typeof attachmentsSchema>[number];
// Decode and resize in-browser before any network request. Never send original files.
export async function prepareImage(file:File):Promise<ImageAttachment>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG, or WebP image.');
 if(file.size>15*1024*1024)throw new Error('Each original image must be under 15 MB.');
 const image=await createImageBitmap(file);
 try{
  const scale=Math.min(1,1024/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image preparation is unavailable in this browser.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let dataUrl=canvas.toDataURL('image/jpeg',.8);if(dataUrl.length>400000)dataUrl=canvas.toDataURL('image/jpeg',.55);
  if(dataUrl.length>400000)throw new Error('This image is too detailed. Crop it or choose a smaller image.');
  return attachmentsSchema.parse([{name:file.name.slice(0,120)||'Reference image',dataUrl}])[0];
 }finally{image.close()}
}
