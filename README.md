GRAND GRAINS ADMIN — GITHUB PAGES CLOUD DEPLOY
================================================

Denne pakken er laget for det eksisterende Grand Grains GitHub-repoet.

MAPPENE SKAL LIGGE SLIK I REPO-ROTEN:

GrandGrainsAdmin/
    index.html
    styles.css
    app.js
    02_Supabase_Admin_Permissions.sql
    03_Add_Admin_User.sql
    README_ADMIN_SETUP.txt
    serve.py
    .nojekyll

.github/
    workflows/
        deploy-grandgrains-admin.yml


FØRSTE GANG
-----------
1. Kopier GrandGrainsAdmin-mappen til roten av Git-repoet ditt.

2. Kopier .github-mappen til roten av repoet.
   Hvis .github allerede finnes, legg bare workflow-filen i:
   .github/workflows/

3. Commit og push begge mappene til main.

4. På github.com:
   Repo -> Settings -> Pages

5. Under "Build and deployment":
   Source -> GitHub Actions

6. Åpne fanen "Actions".
   Workflowen "Deploy Grand Grains Admin" skal starte automatisk.

7. Når den er ferdig, viser deployment-jobben URL-en til nettsiden.

URL-en vil normalt være:
https://DITT-GITHUB-BRUKERNAVN.github.io/REPO-NAVN/


SENERE
------
Når du endrer filer i GrandGrainsAdmin/ og pusher til main, deployes
adminpanelet automatisk på nytt.

Workflowen kjører ikke ved vanlige endringer kun i Swift/Xcode-filene,
fordi den har et paths-filter.


SIKKERHET
---------
GitHub Pages-siden kan nås offentlig på internett. Det er forventet.

Men:
- ingen service_role/secret key finnes i nettsiden
- Supabase publishable key er en klientnøkkel og kan ligge i frontend
- lesing og skriving styres av Supabase RLS
- Save & Publish krever innlogging med en bruker i public.admin_users
- mobilspillet har fortsatt bare leseadgang

Kjør fortsatt SQL-filene i GrandGrainsAdmin/ dersom du ikke allerede har
gjort admin-oppsettet.


VIKTIG
------
GitHub Pages kan bare ha én Pages-deployment per repository. Hvis du allerede
bruker GitHub Pages i dette repoet til en annen nettside, bør adminpanelet
heller ligge i et eget repository eller deployes til Cloudflare Pages/Vercel.
