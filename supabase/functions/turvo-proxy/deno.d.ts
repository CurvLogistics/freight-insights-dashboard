// Supabase Edge Functions run on Deno, not Node/browser — this ambient declaration
// gives the editor's TypeScript server the minimal Deno globals this function uses.
// The Deno runtime itself ignores .d.ts files; this is purely for local type-checking.
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: {
    get(key: string): string | undefined;
  };
}
