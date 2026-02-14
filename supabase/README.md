# Supabase SQL

Organisation des scripts SQL SafeBack.

## Execution rapide
- Execute `all_in_one.sql` dans Supabase SQL Editor.
- N execute pas les migrations individuelles juste apres, sinon doublon inutile.
- Ou en ligne de commande:
  - `SUPABASE_DB_URL='postgresql://...' npm run db:apply`
  - Le script est `scripts/db-apply.sh` (utilise `psql`).

## Migrations individuelles
Ordre d execution:
1. `migrations/001_align_app.sql`
2. `migrations/002_messaging_notifications.sql`
3. `migrations/003_social_graph.sql`
4. `migrations/004_fix_42702_user_id_ambiguous.sql`
5. `migrations/005_guardian_check_requests.sql`
6. `migrations/006_incident_reports.sql`
7. `migrations/007_friend_map_and_wellbeing_ping.sql`

## Legacy
- `legacy/supabase_legacy.sql` garde l ancien schema pour reference uniquement.
