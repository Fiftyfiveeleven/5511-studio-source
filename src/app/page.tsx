import Studio from '@/components/studio';
export default function Page(){return <Studio configuration={{database:!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),generation:!!process.env.OPENAI_API_KEY,deployment:!!process.env.VERCEL_TOKEN}}/>}
