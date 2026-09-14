import {NextResponse} from 'next/server';
import {storageConfigured} from '@/lib/project-storage';
export function GET(){return NextResponse.json({configured:storageConfigured()},{headers:{'Cache-Control':'no-store'}})}
