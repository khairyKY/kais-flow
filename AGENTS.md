# Agentic configuration

## Deployment

Credentials stored in `supabase/.env`. To deploy:

```powershell
$env:SUPABASE_ACCESS_TOKEN = (Get-Content supabase\.env | Select-String 'SUPABASE_ACCESS_TOKEN=(.+)' | ForEach-Object { $_.Matches.Groups[1].Value })
npx supabase db push --include-all
npx supabase functions deploy <name>
```

Migrations live in `supabase/migrations/`. Edge functions in `supabase/functions/`.
