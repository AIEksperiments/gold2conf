GRAND GRAINS CONTROL PANEL
===========================

Dette er en statisk admin-nettside som redigerer public.game_config direkte i
Supabase. Den bruker kun Supabase publishable key. Det er korrekt for en
nettleserapp; RLS-reglene i SQL-filene er det som beskytter skrivetilgang.

INNHOLD
-------
index.html
styles.css
app.js
02_Supabase_Admin_Permissions.sql
03_Add_Admin_User.sql
serve.py

1. KJØR SQL FOR ADMIN-RETTIGHETER
---------------------------------
I Supabase:

SQL Editor -> New query

Lim inn hele:
02_Supabase_Admin_Permissions.sql

Trykk Run.

Dette:
- lager public.admin_users
- gir kun godkjente admin-brukere UPDATE på game_config
- gir admin lesetilgang til game_config_history
- lar mobilspillet fortsatt bare lese config
- holder config.version synkronisert med databaseversjonen

2. OPPRETT DIN ADMIN-BRUKER
---------------------------
Supabase Dashboard:
Authentication -> Users -> Add user

Opprett din egen e-post/passord-bruker.
Bruk gjerne "Auto Confirm User" når du oppretter brukeren.

Deretter åpner du:
03_Add_Admin_User.sql

Bytt:
YOUR_ADMIN_EMAIL_HERE

med e-postadressen du nettopp opprettet, og kjør SQL-filen.

Ikke legg service_role eller secret key i nettsiden.

3. START NETTSIDEN LOKALT PÅ MAC
--------------------------------
Åpne Terminal i denne mappen og kjør:

python3 serve.py

Åpne:
http://localhost:8080

Hvis port 8080 er opptatt:

python3 serve.py 8081

og åpne http://localhost:8081

Du kan også deploye mappen som en vanlig statisk side på GitHub Pages,
Cloudflare Pages, Netlify eller Vercel. Det er ingen backend-kode i nettsiden.

4. LOGG INN
-----------
Bruk e-post/passord-brukeren fra Supabase Auth.

Hvis brukeren er autentisert, men ikke ligger i public.admin_users:
- config kan leses
- Save & Publish og rollback er deaktivert

5. HVA NETTSIDEN KAN GJØRE
--------------------------
- vise og redigere alle felter rekursivt fra JSON-configen
- vise nye config-felter automatisk uten at HTML må oppdateres
- søke på tvers av hele configen
- redigere arrays og nested objects
- rå JSON-editor
- validering av sannsynligheter, cutoffs, ranges, volum og priser
- Save & Publish til Supabase
- automatisk databaseversjonering
- versjonshistorikk
- rollback til tidligere config (rollback blir en NY versjon)

6. HVOR "LIVE" ER EN ENDRING?
-----------------------------
Nettsiden viser en badge på hvert felt:

NEXT ACTION:
Spillet henter ny config live, men verdien brukes ved neste relevante handling
eller runde. Dette gjelder mest spillbalanse.

RESTART:
Asset-navn og lydoppsett er i den nåværende Swift-arkitekturen i stor grad
initialisert når scene/audio manager opprettes. De oppdateres derfor sikrest
ved ny scene/appstart. Vi kan gjøre også disse fullstendig hot-reloadbare i
neste steg.

NEW SAVE:
startingGold gjelder nye spillere / nye save-data, ikke en eksisterende spiller.

7. TEST LIVE-PUBLISERING
------------------------
Kjør spillet fra Xcode slik at konsollen viser:

GG CONFIG: realtime subscribed

Åpne adminpanelet, endre en tydelig balanseringsverdi, f.eks.

bandits.encounterChance
0.35 -> 0.10

Trykk Save & Publish.

Xcode-konsollen skal vise omtrent:

GG CONFIG: realtime change received
GG CONFIG: REMOTE CONFIG LOADED vN

Da er hele kjeden:
Admin-nettside -> Supabase -> Realtime -> iPhone
aktiv.
