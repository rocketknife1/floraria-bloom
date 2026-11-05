# Panoul de administrare

`admin/` e panoul în care proprietarul site-ului schimbă singur tot conținutul, fără cod și fără un programator:

- adaugă produse noi, cu poză direct din telefon (pozele se micșorează automat);
- ascunde ce nu mai are (rămâne în listă, îl arată iar oricând), șterge, mută mai sus sau mai jos;
- schimbă programul, telefonul, livrarea și toate textele;
- pornește sau oprește mesajul de mentenanță;
- readuce orice versiune salvată înainte (din „Istoric”);
- ține lista de comenzi (vezi mai jos).

## Comenzile (Florăria Bloom)

Pe site, clientul alege cu atingeri (ce, când, cum ajung florile, buget) și apasă „Trimite detaliile florăriei”: se deschide WhatsApp cu mesajul gata scris, din partea lui. Site-ul nu salvează nimic și nu cere nume sau telefon (WhatsApp le trimite oricum).

GitHub Pages nu poate primi date de la vizitatori, deci cererea nu intră singură în panou. Florarul o pune el, din secțiunea „Comenzi”:

1. „+ Comandă nouă”, apoi atingeri: ce fel, pentru ce zi (Azi / Mâine), când, unde. Pornește ca „Cerere nouă” și nu apare pe site.
2. Când se apucă de ea: „În lucru”, apoi „Salvează pe site”. Apare pe site, la „Ce pregătim acum” (doar ce, pentru când și localitatea).
3. Nu mai trebuie apăsat nimic: la 30 de minute după intervalul ei, site-ul o trece singur la „livrate azi”. „Gata” o scoate imediat.

Florarul poate pune oricând și comenzi luate la telefon sau în florărie, direct „În lucru”. Totul din `content.json` e public: în comenzi nu se scriu nume, telefoane sau adrese. Comenzile vechi se pot șterge oricând.

Cu `?demo`, panoul și site-ul (`…/?demo`) arată comenzi inventate (din `"demo"` în `schema.json`).

Adresa: **https://rocketknife1.github.io/floraria-bloom/admin/**

Cu `?demo` la final (`…/admin/?demo`) se poate încerca orice fără cont; nimic nu se salvează pe site.

## Cum funcționează

- `admin/schema.json` descrie câmpurile (aceeași schemă o folosește și aplicația Organizator, deci ce se poate edita într-un loc se poate edita și în celălalt).
- „Salvează pe site” face un commit în repo prin API-ul GitHub; GitHub Pages publică site-ul în aproximativ un minut, iar panoul arată când e gata.
- Nu există server. Panoul vorbește direct cu GitHub, cu o cheie de acces pe care proprietarul o pune o singură dată pe dispozitivul lui; cheia rămâne doar în browserul lui.
- Dacă site-ul s-a schimbat între timp din altă parte (Organizator, alt telefon), panoul nu scrie peste: cere „Reîncarcă”.

## Cheia de acces (o singură dată pe fiecare telefon sau calculator)

1. Pe GitHub, în contul în care e repo-ul: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token* (pagina de intrare din panou are butonul „Creează cheia” care deschide direct pagina asta).
2. *Repository access*: **Only select repositories** → repo-ul site-ului.
3. *Permissions → Contents*: **Read and write**. Nimic altceva.
4. *Generate token*, apoi cheia (`github_pat_…`) se lipește în panou.

Dacă cel care administrează e doar colaborator la repo (repo-ul nu e în contul lui), cheile „fine-grained” nu merg pentru repo-ul altcuiva: atunci folosește o cheie clasică cu dreptul `public_repo` (link în panou, la „Altă situație”).

## Când vinzi site-ul

Cel mai simplu: *Settings → Transfer ownership* și repo-ul trece în contul cumpărătorului. Panoul își dă seama singur de repo din adresa de pe GitHub Pages (`cont.github.io/repo/admin/`), deci merge fără nicio schimbare. Cumpărătorul își face cheia lui după pașii de mai sus. Dacă site-ul primește un domeniu propriu, se actualizează `"repo"` din `schema.json` (sau se scrie repo-ul o dată în panou, la „Altă situație”).

## Pentru alt site

Panoul nu știe nimic anume despre Florăria Bloom. Pentru alt site:

1. copiezi `admin/index.html`, `admin/admin.js`, `admin/admin.css` (și acest README) în folderul `admin/` al celuilalt site;
2. îi scrii `admin/schema.json` (câmpurile lui; tipurile posibile sunt cele din `admin.js`, funcția `field`: text, longtext, number, money, bool, select, date, time, color, image, imageList, stringList, slug, hours, weekdays, list, group, readonly);
3. opțional, în schema: `"repo": "cont/repo"`, `"accent": "#culoare"`, `"maintenance": "cale/maintenance.json"`.

Pentru „ascunde de pe site”, o listă primește în schemă câmpul `{"key": "hidden", "type": "bool", "label": "Ascuns de pe site"}`, iar site-ul sare peste elementele cu `"hidden": true`.

Chei în plus, doar pentru panoul web (aplicația Organizator le ignoră, deci schema rămâne aceeași pentru amândouă):

- la un câmp `select`: `"display": "chips"` arată butoane mari în loc de listă derulantă;
- la un câmp `date`: `"quickDays": true` adaugă „Azi / Mâine / Poimâine”, iar un element nou pornește de la azi;
- la un câmp `text`: `"placeholder"`;
- la o listă: `"itemQuick": "cheie"` pune butoanele unui `select` direct pe rândul fiecărui element; `"itemDetails": ["cheie", …]` adaugă câmpuri pe rândul mic; `"newItemFirst": true` pune elementele noi sus; `"addLabel"` schimbă textul butonului de adăugat;
- la o secțiune: `"open": true` o deschide de la început;
- în rădăcina schemei: `"demo": {"fișier.json": {cheie: valoare}}` dă date de probă pentru `?demo`; zilele scrise `"@+0"`, `"@+1"` devin azi, mâine.
