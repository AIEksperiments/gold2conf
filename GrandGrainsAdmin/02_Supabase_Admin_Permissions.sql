-- Grand Grains Admin Website permissions
-- Run this once in Supabase -> SQL Editor.
-- This does NOT create an admin user. Use 03_Add_Admin_User.sql afterwards.

create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists "grand_grains_admin_read_own_membership"
on public.admin_users;

create policy "grand_grains_admin_read_own_membership"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.is_grand_grains_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admin_users
        where user_id = auth.uid()
    );
$$;

revoke all on function public.is_grand_grains_admin() from public;
grant execute on function public.is_grand_grains_admin() to authenticated;

-- Authenticated admins may update only the single live config row.
drop policy if exists "grand_grains_admin_update_live_config"
on public.game_config;

create policy "grand_grains_admin_update_live_config"
on public.game_config
for update
to authenticated
using (
    id = 'live'
    and public.is_grand_grains_admin()
)
with check (
    id = 'live'
    and public.is_grand_grains_admin()
);

grant update on public.game_config to authenticated;

-- History remains invisible to normal players and becomes readable to admins.
drop policy if exists "grand_grains_admin_read_config_history"
on public.game_config_history;

create policy "grand_grains_admin_read_config_history"
on public.game_config_history
for select
to authenticated
using (public.is_grand_grains_admin());

grant select on public.game_config_history to authenticated;

-- Replace the archive trigger function with a version that also keeps the
-- embedded config.version in sync with the database row version.
create or replace function public.grand_grains_archive_game_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.config is distinct from new.config then
        insert into public.game_config_history (
            config_id,
            version,
            config,
            archived_at
        )
        values (
            old.id,
            old.version,
            old.config,
            now()
        );

        new.version := old.version + 1;
        new.config := jsonb_set(
            coalesce(new.config, '{}'::jsonb),
            '{version}',
            to_jsonb(new.version),
            true
        );
    end if;

    new.updated_at := now();
    return new;
end;
$$;
