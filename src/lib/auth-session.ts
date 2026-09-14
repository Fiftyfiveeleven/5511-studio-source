export const authCookie='studio_auth';
export function requestToken(request:Request){
 const header=request.headers.get('authorization');
 if(header)return /^Bearer [^\s]+$/.test(header)?header.slice(7):'';
 const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(authCookie+'='))?.slice(authCookie.length+1);
 try{return value?decodeURIComponent(value):''}catch{return ''}
}
export function accountAllowed(user:{is_anonymous?:boolean;email?:string},allowed=process.env.STUDIO_ALLOWED_EMAILS){
 if(user.is_anonymous||!user.email)return false;
 const list=allowed?.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 return !list?.length||list.includes(user.email.toLowerCase());
}
