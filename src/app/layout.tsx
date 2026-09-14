import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'5511 Studio — Build your next idea',description:'Create, refine, and launch apps with Fifty Five 11. Your Supabase. Your Vercel. Your code.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
