-- Grand Grains: make one existing Supabase Auth user an admin.
--
-- FIRST:
-- Supabase Dashboard -> Authentication -> Users -> Add user
-- Create your own email/password user and auto-confirm it.
--
-- THEN replace YOUR_ADMIN_EMAIL_HERE below and run this script.

do $$
declare
    v_email text := 'YOUR_ADMIN_EMAIL_HERE';
    v_user_id uuid;
begin
    select id
    into v_user_id
    from auth.users
    where lower(email) = lower(v_email)
    limit 1;

    if v_user_id is null then
        raise exception
            'No Supabase Auth user found for %. Create the user first under Authentication -> Users.',
            v_email;
    end if;

    insert into public.admin_users (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    raise notice 'Grand Grains admin enabled for % (user id %)', v_email, v_user_id;
end
$$;
