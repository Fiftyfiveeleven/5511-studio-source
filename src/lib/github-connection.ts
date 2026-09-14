import {z} from 'zod';
export const githubConnectionSchema=z.object({repository:z.string().max(200).regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/),branch:z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./-]+$/),head:z.string().regex(/^[a-f0-9]{40}$/).nullable()});
export type GithubConnection=z.infer<typeof githubConnectionSchema>;
